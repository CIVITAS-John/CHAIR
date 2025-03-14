import Excel from "exceljs";

import type { Code, CodedThreads, DataChunk, DataItem, Message, Project } from "../schema";
import type { IDStrFunc } from "../steps/base-step";

import { logger } from "./logger";

const { Workbook } = Excel;

// Range: Generate a range of numbers.
export function Range(startAt: number, endAt: number): number[] {
    return [...Array(endAt - startAt + 1).keys()].map((i) => i + startAt);
}

/** Get the row height for the given content. */
export const getRowHeight = (content: string, width: number) =>
    content
        .split("\n")
        .map((text) => Math.max(1, Math.ceil(text.length / width)))
        .reduce((acc, cur) => acc + cur) *
        15 +
    3;

/** Sort an array of codes. */
export const sortCodes = (codes: Code[]) =>
    [...codes].sort((A, B) => {
        const category = (A.categories?.sort().join("; ") ?? "").localeCompare(
            B.categories?.sort().join("; ") ?? "",
        );
        return category !== 0 ? category : A.label.localeCompare(B.label);
    });

// Export: Export the JSON data into human-readable formats.
// ExportMessages: Export messages into markdown.
export function ExportMessages(Messages: Message[], Originals?: Message[]): string {
    let Result = "";
    let LastConversation = "-1";
    for (let I = 0; I < Messages.length; I++) {
        const Message = Messages[I];
        // Write a separator if the time gap is too long
        if (Message.chunk && LastConversation !== Message.chunk) {
            Result += `\n=== ${Message.chunk}\n\n`;
            LastConversation = Message.chunk;
        }
        // Export the message
        Result += `${Message.ID}. **P${Message.uid}, ${Message.nickname}**`;
        if (Originals !== undefined && Originals[I].nickname !== Message.nickname) {
            Result += ` (${Originals[I].nickname})`;
        }
        Result += `: ${Message.Time.toLocaleString("en-US", { timeZone: "Asia/Shanghai" })}\n`;
        Result += Message.Content;
        if (Originals !== undefined && Message.Content !== Originals[I].Content) {
            Result += `\n${Originals[I].Content}`;
        }
        Result += "\n";
    }
    return Result;
}

// ExportProjects: Export projects into markdown.
export function ExportProjects(Projects: Project[], Originals?: Project[]): string {
    let Result = "";
    for (let I = 0; I < Projects.length; I++) {
        const Project = Projects[I];
        const Original = Originals ? Originals[I] : undefined;
        // Title
        Result += `## ${Projects[I].Title} (${Projects[I].ID})`;
        if (Original && Original.Title !== Project.Title) {
            Result += `* Title: ${Original.Title}\n`;
        }
        // Author
        Result += `\n* Author: P${Projects[I].uid}, ${Projects[I].nickname}`;
        if (Original && Original.nickname !== Project.nickname) {
            Result += ` (${Original.nickname})`;
        }
        // Tags
        Result += `\n* Tags: ${Projects[I].Tags.join(", ")}`;
        // Time
        Result += `\n* Time: ${Projects[I].Time.toLocaleString("en-US", { timeZone: "Asia/Shanghai" })}`;
        // Visits
        Result += `\n* Popularity: Visits ${Projects[I].Visits}, Stars ${Projects[I].Stars}, Supports ${Projects[I].Supports}`;
        // Image
        Result += `\n![Cover](${Projects[I].Cover})`;
        // Content
        Result += `\n\n### Content\n${Projects[I].Content}`;
        if (Original && Original.Content !== Project.Content) {
            Result += `\n${Original.Content}`;
        }
        // Comments
        if (Project.items) {
            Result += "\n\n### Comments";
            Project.items.reverse(); // Here I had a little bug, the original exports have comments in reversed order.
            for (let N = 0; N < Project.items.length; N++) {
                const Comment = Project.items[N];
                const OriginalComment = Original ? Original.items[N] : undefined;
                Result += `\n${N + 1}. **P${Comment.uid}, ${Comment.nickname}**`;
                if (OriginalComment && Comment.nickname !== OriginalComment.nickname) {
                    Result += ` (${OriginalComment.nickname})`;
                }
                Result += `: ${Comment.Time.toLocaleString("en-US", { timeZone: "Asia/Shanghai" })}\n`;
                Result += Comment.Content;
                if (OriginalComment && Comment.Content !== OriginalComment.Content) {
                    Result += `\n${OriginalComment.Content}`;
                }
            }
        }
        Result += "\n\n";
    }
    return Result;
}

/** Export Chunks into an Excel workbook for coding. */
export const exportChunksForCoding = <T extends DataItem>(
    idStr: IDStrFunc,
    chunks: DataChunk<T>[],
    analyses: CodedThreads = { threads: {} },
) => {
    const _id = idStr("exportChunksForCoding");

    logger.info(`Exporting ${chunks.length} chunks to Excel`, _id);
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
        logger.debug(`Exporting chunk ${chunk.id}`, _id);
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
            logger.debug(`Exporting message ${message.id}`, _id);
            const item = analysis.items[message.id] ?? analysis.items[message.id.substring(2)];
            // TODO: Support subchunks
            if ("items" in message) {
                logger.warn(
                    "Subchunks are not yet supported, skipping",
                    idStr("exportChunksForCoding"),
                );
                continue;
            }
            message.chunk = message.chunk ?? chunk.id;
            const columns = {
                ID: message.id,
                CID: message.chunk,
                SID: Number.isNaN(parseInt(message.uid)) ? message.uid : parseInt(message.uid),
                Nickname: message.nickname,
                Time: message.time,
                In: message.chunk === chunk.id ? "Y" : "N",
                Content: message.content,
                Codes: item.codes?.join(", ") ?? "",
                Memo: message.tags?.join(", ") ?? "",
                Consolidated: [
                    ...new Set(item.codes?.map((Code) => consolidation.get(Code) ?? Code) ?? []),
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
        logger.debug(`Exported ${messages.length} messages`, _id);
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
            analysis.plan ?? "(Optional) Your thoughts before coding the chunk.",
        );
        addExtraRow(-2, "Summary", analysis.summary ?? "The summary of the chunk.");
        addExtraRow(
            -3,
            "Reflection",
            analysis.reflection ?? "Your reflections after coding the chunk.",
        );
        logger.debug("Finished exporting chunk", _id);
    }
    // Export the codebook
    exportCodebook(idStr, book, analyses);
    logger.info(`Exported ${chunks.length} chunks to Excel`, _id);
    return book;
};

/** Export a codebook into an Excel workbook. */
export const exportCodebook = (
    idStr: IDStrFunc,
    book: Excel.Workbook,
    analyses: CodedThreads = { threads: {} },
    name = "Codebook",
) => {
    const _id = idStr("exportCodebook");

    if (analyses.codebook === undefined) {
        logger.warn("No codebook to export", _id);
        return;
    }

    logger.info("Exporting codebook to Excel", _id);
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
    // Write the codebook
    let codes = Object.values(analyses.codebook);
    // Sort the codes
    codes = sortCodes(codes);
    // Write the codes
    for (const code of codes) {
        logger.debug(`Exporting code ${code.label}`, _id);
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
        const Row = sheet.addRow({
            Label: code.label,
            Category: categories,
            Definition: definitions,
            Examples: examples,
            Alternatives: alternatives,
        });
        Row.font = {
            name: "Lato",
            family: 4,
            size: 12,
        };
        Row.height = Math.max(
            30,
            getRowHeight(categories, 100),
            getRowHeight(definitions, 100),
            getRowHeight(examples, 100),
        );
        Row.alignment = { vertical: "middle" };
        Row.getCell("Category").alignment = { vertical: "middle", wrapText: true };
        Row.getCell("Definition").alignment = { vertical: "middle", wrapText: true };
        Row.getCell("Examples").alignment = { vertical: "middle", wrapText: true };
        Row.getCell("Alternatives").alignment = { vertical: "middle", wrapText: true };
        logger.debug(`Exported code ${code.label}`, _id);
    }
    logger.info("Exported codebook to Excel", _id);
};
