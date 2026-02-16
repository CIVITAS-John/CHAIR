/**
 * Excel Export for Qualitative Coding
 *
 * This module handles exporting qualitative data analysis to Excel:
 * - Export chunks and codes to Excel for manual coding/review
 * - Export codebook with categories, definitions, examples, alternatives
 *
 * Key Features:
 * - Exports data chunks as separate worksheets with frozen headers
 * - Supports nested data structures (chunks containing subchunks)
 * - Special rows for thoughts, summary, and reflection per chunk
 * - Automatic consolidation tracking (alternatives mapped to canonical codes)
 *
 * The "|||" Separator Convention:
 * - Examples stored internally as: "ID|||Speaker: Content"
 * - When exporting to Excel: "|||" replaced with ": " for readability
 * - Why "|||"?
 *   - Unlikely to appear in natural text
 *   - Easy to split/join programmatically
 *   - Preserves structure for ID extraction when needed
 *   - Human-readable when converted to ": " in Excel
 *
 * Excel Format:
 * - Data sheets: ID, CID, SID, Nickname, Time, In, Content, Codes, Memo, Consolidated
 * - Codebook sheet: Label, Category, Definition, Examples, Alternatives
 * - Multiple items separated by newlines with "* " bullet points
 * - Row heights auto-calculated based on content length
 *
 * @example
 * // Export for coding
 * const workbook = exportChunksForCoding(chunks, existingAnalyses);
 * await workbook.xlsx.writeFile("coding.xlsx");
 */

import Excel from "exceljs";

import type { ItemComparison } from "../../evaluating/reliability-metrics.js";
import type { Code, CodedThreads, DataChunk, DataItem } from "../../schema.js";

import { logger } from "../core/logger.js";

const { Workbook } = Excel;

/**
 * Calculate appropriate Excel row height based on content
 *
 * Estimates row height needed to display multi-line content with text wrapping.
 * Uses 15 pixels per line as base height.
 *
 * @param content - Text content that will be displayed
 * @param width - Column width in characters
 * @returns Suggested row height in pixels
 */
export const getRowHeight = (content: string, width: number) =>
    content
        .split("\n")
        .map((text) => Math.max(1, Math.ceil(text.length / width)))
        .reduce((acc, cur) => acc + cur) *
        15 +
    3;

/**
 * Sort codes by category and label
 *
 * Primary sort: Categories (alphabetically joined)
 * Secondary sort: Label (alphabetically)
 *
 * @param codes - Array of code objects to sort
 * @returns New sorted array
 */
export const sortCodes = (codes: Code[]) =>
    [...codes].sort((A, B) => {
        const category = (A.categories?.sort().join("; ") ?? "").localeCompare(
            B.categories?.sort().join("; ") ?? "",
        );
        return category !== 0 ? category : A.label.localeCompare(B.label);
    });

/** Column definition for extra columns beyond the base data columns. */
export interface ExtraColumn {
    header: string;
    key: string;
    width: number;
}

/** Options for the reusable chunk export helper. */
export interface ChunkExportOptions<T extends DataItem> {
    /** Data chunks to export (one worksheet per chunk) */
    chunks: DataChunk<T>[];
    /** Additional columns beyond the base (ID, CID, SID, Nickname, Time, In, Content) */
    extraColumns: ExtraColumn[];
    /** Callback to provide values for extra columns per message */
    getExtraData: (message: T, chunkId: string) => Record<string, string | number>;
    /** Optional callback to provide a fill for the row (e.g., for highlighting) */
    getRowFill?: (message: T, chunkId: string) => Excel.Fill | undefined;
    /** Whether to add Thoughts/Summary/Reflection rows. Defaults to true. */
    extraRows?: boolean;
    /** CodedThreads for extra row content (plan/summary/reflection) */
    analyses?: CodedThreads;
    /** Extra columns whose cells should have wrapText alignment */
    wrapColumns?: string[];
    /** Optional callback to post-process a row after it's been added (e.g., for rich text formatting) */
    postProcessRow?: (row: Excel.Row, message: T, chunkId: string) => void;
}

const BASE_COLUMNS: Partial<Excel.Column>[] = [
    { header: "ID", key: "ID", width: 8 },
    { header: "CID", key: "CID", width: 6 },
    { header: "SID", key: "SID", width: 6 },
    { header: "Nickname", key: "Nickname", width: 16 },
    { header: "Time", key: "Time", width: 13, style: { numFmt: "mm/dd hh:MM" } },
    { header: "In", key: "In", width: 4 },
    { header: "Content", key: "Content", width: 120 },
];

const HEADER_FONT: Partial<Excel.Font> = {
    name: "Lato",
    family: 4,
    size: 12,
    bold: true,
};

const DATA_FONT = (inChunk: boolean): Partial<Excel.Font> => ({
    name: "Lato",
    family: 4,
    size: 12,
    color: { argb: inChunk ? "FF000000" : "FF666666" },
});

/** Reusable helper: export chunks into per-chunk worksheets with configurable extra columns. */
export const exportChunks = <T extends DataItem>(
    book: Excel.Workbook,
    options: ChunkExportOptions<T>,
) => {
    const { chunks, extraColumns, getExtraData, getRowFill, postProcessRow, analyses, wrapColumns } = options;
    const addExtraRows = options.extraRows ?? true;

    for (const chunk of chunks) {
        logger.debug(`Exporting chunk ${chunk.id}`);
        const messages = chunk.items;
        const analysis = analyses?.threads[chunk.id] ?? analyses?.threads[chunk.id.substring(2)];

        const sheet = book.addWorksheet(chunk.id, {
            views: [{ state: "frozen", xSplit: 1, ySplit: 1 }],
        });
        sheet.columns = [
            ...BASE_COLUMNS,
            ...extraColumns.map(({ header, key, width }) => ({ header, key, width })),
        ];
        sheet.getRow(1).alignment = { vertical: "middle", wrapText: true };
        sheet.getRow(1).font = HEADER_FONT;
        sheet.properties.defaultRowHeight = 18;

        for (const message of messages) {
            // TODO: Support subchunks
            if ("items" in message) {
                logger.warn("Subchunks are not yet supported, skipping");
                continue;
            }
            message.chunk = message.chunk ?? chunk.id;
            const inChunk = message.chunk === chunk.id;
            const baseData = {
                ID: message.id,
                CID: message.chunk,
                SID: Number.isNaN(parseInt(message.uid)) ? message.uid : parseInt(message.uid),
                Nickname: message.nickname,
                Time: message.time,
                In: inChunk ? "Y" : "N",
                Content: message.content,
            };
            const extra = getExtraData(message, chunk.id);
            const row = sheet.addRow({ ...baseData, ...extra });
            row.font = DATA_FONT(inChunk);
            row.height = getRowHeight(message.content, 120);
            row.alignment = { vertical: "middle" };
            row.getCell("Content").alignment = { vertical: "middle", wrapText: true };
            for (const key of wrapColumns ?? []) {
                row.getCell(key).alignment = { vertical: "middle", wrapText: true };
            }
            const fill = getRowFill?.(message, chunk.id);
            if (fill) {
                row.eachCell((cell) => { cell.fill = fill; });
            }
            postProcessRow?.(row, message, chunk.id);
        }

        if (addExtraRows) {
            sheet.addRow({});
            const addExtraRow = (id: number, name: string, content: string) => {
                const lastRow = sheet.addRow({ ID: id, Nickname: name, Content: content });
                lastRow.height = Math.max(30, getRowHeight(content, 120));
                lastRow.alignment = { vertical: "middle" };
                lastRow.getCell("Content").alignment = { vertical: "middle", wrapText: true };
                lastRow.font = { name: "Lato", family: 4, size: 12 };
            };
            addExtraRow(
                -1, "Thoughts",
                (analysis?.plan) ?? "(Optional) Your thoughts before coding the chunk.",
            );
            addExtraRow(
                -2, "Summary",
                (analysis?.summary) ?? "The summary of the chunk.",
            );
            addExtraRow(
                -3, "Reflection",
                (analysis?.reflection) ?? "Your reflections after coding the chunk.",
            );
        }
        logger.debug("Finished exporting chunk");
    }
};

/** Export Chunks into an Excel workbook for coding. */
export const exportChunksForCoding = <T extends DataItem>(
    chunks: DataChunk<T>[],
    analyses: CodedThreads = { threads: {} },
) =>
    logger.withDefaultSource("exportChunksForCoding", () => {
        logger.info(`Exporting ${chunks.length} chunks to Excel`);
        const book = new Workbook();

        // Build consolidation map (alternative → canonical label)
        const consolidation = new Map<string, string>();
        if (analyses.codebook) {
            for (const code of Object.values(analyses.codebook)) {
                if (code.alternatives?.length) {
                    code.alternatives.forEach((alternative) =>
                        consolidation.set(alternative, code.label),
                    );
                }
            }
        }

        exportChunks(book, {
            chunks,
            extraColumns: [
                { header: "Codes", key: "Codes", width: 80 },
                { header: "Memo", key: "Memo", width: 80 },
                { header: "Consolidated", key: "Consolidated", width: 80 },
            ],
            getExtraData: (message) => {
                const analysis = analyses.threads[message.chunk!] ?? analyses.threads[message.chunk!.substring(2)];
                const codes = analysis?.items[message.id]?.codes;
                return {
                    Codes: codes?.join(", ") ?? "",
                    Memo: message.tags?.join(", ") ?? "",
                    Consolidated: [
                        ...new Set(codes?.map((c) => consolidation.get(c) ?? c) ?? []),
                    ].join(", "),
                };
            },
            wrapColumns: ["Memo"],
            extraRows: true,
            analyses,
        });

        exportCodebook(book, analyses);
        logger.info(`Exported ${chunks.length} chunks to Excel`);
        return book;
    });


/** Export a codebook into an Excel workbook. */
export const exportCodebook = (
    book: Excel.Workbook,
    analyses: CodedThreads = { threads: {} },
    name = "Codebook",
) => {
    logger.withDefaultSource("exportCodebook", () => {
        logger.info("Exporting codebook to Excel");
        const sheet = book.addWorksheet(name, {
            views: [{ state: "frozen", xSplit: 1, ySplit: 1 }],
        });
        // Set the columns
        sheet.columns = [
            { header: "Label", key: "Label", width: 30 },
            { header: "Category", key: "Category", width: 30 },
            { header: "Definition", key: "Definition", width: 80 },
            { header: "Examples", key: "Examples", width: 120 },
            { header: "Alternatives", key: "Alternatives", width: 40 },
        ];
        sheet.getRow(1).alignment = { vertical: "middle", wrapText: true };
        sheet.getRow(1).font = {
            name: "Lato",
            family: 4,
            size: 12,
            bold: true,
        };
        sheet.properties.defaultRowHeight = 18;
        if (analyses.codebook === undefined) {
            logger.warn("No codebook to export");
            return;
        }

        // Write the codebook
        let codes = Object.values(analyses.codebook);
        // Sort the codes
        codes = sortCodes(codes);
        // Write the codes
        for (const code of codes) {
            logger.debug(`Exporting code ${code.label}`);
            const categories =
                code.categories
                    ?.map((category) =>
                        (code.categories ?? []).length > 1 ? `* ${category}` : category,
                    )
                    .join("\n") ?? "";
            const definitions =
                code.definitions
                    ?.map((Definition) =>
                        (code.definitions ?? []).length > 1 ? `* ${Definition}` : Definition,
                    )
                    .join("\n") ?? "";
            const examples =
                code.examples
                    ?.map((Example) =>
                        (code.examples ?? []).length > 1
                            ? `* ${Example.replace("|||", ": ")}`
                            : Example.replace("|||", ": "),
                    )
                    .join("\n") ?? "";
            const alternatives = code.alternatives?.map((Code) => `* ${Code}`).join("\n") ?? "";
            const row = sheet.addRow({
                Label: code.label,
                Category: categories,
                Definition: definitions,
                Examples: examples,
                Alternatives: alternatives,
            });
            row.font = {
                name: "Lato",
                family: 4,
                size: 12,
            };
            row.height = Math.max(
                30,
                getRowHeight(categories, 100),
                getRowHeight(definitions, 100),
                getRowHeight(examples, 100),
            );
            row.alignment = { vertical: "middle" };
            row.getCell("Category").alignment = { vertical: "middle", wrapText: true };
            row.getCell("Definition").alignment = { vertical: "middle", wrapText: true };
            row.getCell("Examples").alignment = { vertical: "middle", wrapText: true };
            row.getCell("Alternatives").alignment = { vertical: "middle", wrapText: true };
            logger.debug(`Exported code ${code.label}`);
        }
        logger.info("Exported codebook to Excel");
    });
};

const DISAGREEMENT_FILL: Excel.Fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFCE4EC" }, // light pink
};

/** Build rich text with differing codes bolded. */
const buildCodeRichText = (
    codes: string[],
    otherCodes: Set<string>,
    baseFont: Partial<Excel.Font>,
): Excel.CellRichTextValue => ({
    richText: codes.flatMap((code, i) => {
        const isDiff = !otherCodes.has(code);
        const segment: Excel.RichText = {
            text: code,
            font: isDiff ? { ...baseFont, bold: true } : baseFont,
        };
        return i < codes.length - 1 ? [segment, { text: ", ", font: baseFont }] : [segment];
    }),
});

/** Export a comparison XLSX showing two coders' codes side-by-side with disagreement highlighting. */
export const exportComparisonXlsx = <T extends DataItem>(
    chunks: DataChunk<T>[],
    comparisons: ItemComparison[],
    coder1Name: string,
    coder2Name: string,
) =>
    logger.withDefaultSource("exportComparisonXlsx", () => {
        logger.info(`Exporting comparison for ${coder1Name} vs ${coder2Name}`);
        const book = new Workbook();

        // Build lookup from itemId → comparison
        const compMap = new Map(comparisons.map((c) => [c.itemId, c]));

        exportChunks(book, {
            chunks,
            extraColumns: [
                { header: `Adjusted (${coder1Name})`, key: "Adjusted1", width: 60 },
                { header: `Adjusted (${coder2Name})`, key: "Adjusted2", width: 60 },
                { header: `Codes (${coder1Name})`, key: "Codes1", width: 60 },
                { header: `Codes (${coder2Name})`, key: "Codes2", width: 60 },
                { header: "Difference", key: "Difference", width: 12 },
            ],
            getExtraData: (message) => {
                const comp = compMap.get(message.id);
                if (!comp) return { Adjusted1: "", Adjusted2: "", Codes1: "", Codes2: "", Difference: "" };
                return {
                    Adjusted1: comp.adjustedCodes1.join(", "),
                    Adjusted2: comp.adjustedCodes2.join(", "),
                    Codes1: comp.codes1.join(", "),
                    Codes2: comp.codes2.join(", "),
                    Difference: comp.difference.toFixed(3),
                };
            },
            getRowFill: (message) => {
                const comp = compMap.get(message.id);
                return comp && comp.difference > 0 ? DISAGREEMENT_FILL : undefined;
            },
            postProcessRow: (row, message) => {
                const comp = compMap.get(message.id);
                if (!comp || comp.difference === 0) return;
                const adj1Set = new Set(comp.adjustedCodes1);
                const adj2Set = new Set(comp.adjustedCodes2);
                const font = row.font as Partial<Excel.Font>;
                if (comp.adjustedCodes1.length > 0) {
                    row.getCell("Adjusted1").value = buildCodeRichText(comp.adjustedCodes1, adj2Set, font);
                }
                if (comp.adjustedCodes2.length > 0) {
                    row.getCell("Adjusted2").value = buildCodeRichText(comp.adjustedCodes2, adj1Set, font);
                }
            },
            extraRows: false,
        });

        logger.info(`Exported comparison for ${coder1Name} vs ${coder2Name}`);
        return book;
    });

