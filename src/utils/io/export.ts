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

/** Export Chunks into an Excel workbook for coding. */
export const exportChunksForCoding = <T extends DataItem>(
    chunks: DataChunk<T>[],
    analyses: CodedThreads = { threads: {} },
) =>
    logger.withDefaultSource("exportChunksForCoding", () => {
        logger.info(`Exporting ${chunks.length} chunks to Excel`);
        const book = new Workbook();
        // const Consolidated = false;
        const consolidation = new Map<string, string>();
        // Whether the codebook is consolidated
        if (analyses.codebook) {
            for (const code of Object.values(analyses.codebook)) {
                if (code.alternatives?.length) {
                    code.alternatives.forEach((alternative) =>
                        consolidation.set(alternative, code.label),
                    );
                }
            }
            // consolidated = consolidation.size > 0;
        }
        // Export the Chunks
        for (const chunk of chunks) {
            logger.debug(`Exporting chunk ${chunk.id}`);
            const messages = chunk.items;
            const analysis = analyses.threads[chunk.id] ?? analyses.threads[chunk.id.substring(2)];
            // Write into Excel worksheet
            const sheet = book.addWorksheet(chunk.id, {
                views: [{ state: "frozen", xSplit: 1, ySplit: 1 }],
            });
            // Set the columns
            sheet.columns = [
                { header: "ID", key: "ID", width: 8 },
                { header: "CID", key: "CID", width: 6 },
                { header: "SID", key: "SID", width: 6 },
                { header: "Nickname", key: "Nickname", width: 16 },
                { header: "Time", key: "Time", width: 13, style: { numFmt: "mm/dd hh:MM" } },
                { header: "In", key: "In", width: 4 },
                { header: "Content", key: "Content", width: 120 },
                { header: "Codes", key: "Codes", width: 80 },
                { header: "Memo", key: "Memo", width: 80 },
                { header: "Consolidated", key: "Consolidated", width: 80 },
            ];
            sheet.getRow(1).alignment = { vertical: "middle", wrapText: true };
            sheet.getRow(1).font = {
                name: "Lato",
                family: 4,
                size: 12,
                bold: true,
            };
            sheet.properties.defaultRowHeight = 18;
            // Write the messages
            for (const message of messages) {
                logger.debug(`Exporting message ${message.id}`);
                // TODO: Support subchunks
                if ("items" in message) {
                    logger.warn("Subchunks are not yet supported, skipping");
                    continue;
                }
                const codes =
                    typeof analysis === "undefined"
                        ? undefined
                        : (analysis.items[message.id] ?? analysis.items[message.id.substring(2)])
                              ?.codes; // eslint-disable-line @typescript-eslint/no-unnecessary-condition
                message.chunk = message.chunk ?? chunk.id;
                const columns = {
                    ID: message.id,
                    CID: message.chunk,
                    SID: Number.isNaN(parseInt(message.uid)) ? message.uid : parseInt(message.uid),
                    Nickname: message.nickname,
                    Time: message.time,
                    In: message.chunk === chunk.id ? "Y" : "N",
                    Content: message.content,
                    Codes: codes?.join(", ") ?? "",
                    Memo: message.tags?.join(", ") ?? "",
                    Consolidated: [
                        ...new Set(codes?.map((Code) => consolidation.get(Code) ?? Code) ?? []),
                    ].join(", "),
                };
                const Row = sheet.addRow(columns);
                Row.font = {
                    name: "Lato",
                    family: 4,
                    size: 12,
                    color: { argb: message.chunk === chunk.id ? "FF000000" : "FF666666" },
                };
                Row.height = getRowHeight(message.content, 120);
                Row.alignment = { vertical: "middle" };
                Row.getCell("Content").alignment = { vertical: "middle", wrapText: true };
                Row.getCell("Memo").alignment = { vertical: "middle", wrapText: true };
            }
            sheet.addRow({});
            logger.debug(`Exported ${messages.length} messages`);
            // Extra row for notes
            const addExtraRow = (id: number, name: string, content: string) => {
                const lastRow = sheet.addRow({ ID: id, Nickname: name, Content: content });
                lastRow.height = Math.max(30, getRowHeight(content, 120));
                lastRow.alignment = { vertical: "middle" };
                lastRow.getCell("Content").alignment = { vertical: "middle", wrapText: true };
                lastRow.font = {
                    name: "Lato",
                    family: 4,
                    size: 12,
                };
            };
            addExtraRow(
                -1,
                "Thoughts",
                (typeof analysis === "undefined" ? null : analysis.plan) ??
                    "(Optional) Your thoughts before coding the chunk.",
            );
            addExtraRow(
                -2,
                "Summary",
                (typeof analysis === "undefined" ? null : analysis.summary) ??
                    "The summary of the chunk.",
            );
            addExtraRow(
                -3,
                "Reflection",
                (typeof analysis === "undefined" ? null : analysis.reflection) ??
                    "Your reflections after coding the chunk.",
            );
            logger.debug("Finished exporting chunk");
        }
        // Export the codebook
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

