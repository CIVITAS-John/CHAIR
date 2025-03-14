import Excel from "exceljs";

import type { Code, CodedThreads, DataChunk, DataItem, Message, Project } from "../schema";

import { logger } from "./logger";

const { Workbook } = Excel;

// Range: Generate a range of numbers.
export function Range(startAt: number, endAt: number): number[] {
    return [...Array(endAt - startAt + 1).keys()].map((i) => i + startAt);
}

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

/** GetRowHeight: Get the row height for a given content. */
export function GetRowHeight(Content: string, Width: number): number {
    return (
        Content.split("\n")
            .map((Text) => Math.max(1, Math.ceil(Text.length / Width)))
            .reduce((Prev, Curr) => Prev + Curr) *
            15 +
        3
    );
}

/** Export Chunks into an Excel workbook for coding. */
export function exportChunksForCoding<T extends DataItem>(
    chunks: DataChunk<T>[],
    analyses: CodedThreads = { threads: {} },
) {
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
            const item = analysis.items[message.id] ?? analysis.items[message.id.substring(2)];
            // TODO: Support subchunks
            if (!("chunk" in message)) {
                logger.warn("Subchunks are not yet supported, skipping", "exportChunksForCoding");
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
            Row.height = GetRowHeight(message.content, 120);
            Row.alignment = { vertical: "middle" };
            Row.getCell("Content").alignment = { vertical: "middle", wrapText: true };
            Row.getCell("Memo").alignment = { vertical: "middle", wrapText: true };
        }
        sheet.addRow({});
        // Extra row for notes
        const AddExtraRow = (ID: number, Name: string, Content: string) => {
            const LastRow = sheet.addRow({ ID, Nickname: Name, Content });
            LastRow.height = Math.max(30, GetRowHeight(Content, 120));
            LastRow.alignment = { vertical: "middle" };
            LastRow.getCell("Content").alignment = { vertical: "middle", wrapText: true };
            LastRow.font = {
                name: "Lato",
                family: 4,
                size: 12,
            };
        };
        AddExtraRow(
            -1,
            "Thoughts",
            analysis.plan ?? "(Optional) Your thoughts before coding the chunk.",
        );
        AddExtraRow(-2, "Summary", analysis.summary ?? "The summary of the chunk.");
        AddExtraRow(
            -3,
            "Reflection",
            analysis.reflection ?? "Your reflections after coding the chunk.",
        );
    }
    // Export the codebook
    ExportCodebook(book, analyses);
    return book;
}

/** ExportCodebook: Export a codebook into an Excel workbook. */
export function ExportCodebook(
    Book: Excel.Workbook,
    Analyses: CodedThreads = { Threads: {} },
    Name = "Codebook",
) {
    if (Analyses.Codebook === undefined) {
        return;
    }
    const Sheet = Book.addWorksheet(Name, {
        views: [{ state: "frozen", xSplit: 1, ySplit: 1 }],
    });
    // Set the columns
    Sheet.columns = [
        { header: "Label", key: "Label", width: 30 },
        { header: "Category", key: "Category", width: 30 },
        { header: "Definition", key: "Definition", width: 80 },
        { header: "Examples", key: "Examples", width: 120 },
        { header: "Alternatives", key: "Alternatives", width: 40 },
    ];
    Sheet.getRow(1).alignment = { vertical: "middle", wrapText: true };
    Sheet.getRow(1).font = {
        name: "Lato",
        family: 4,
        size: 12,
        bold: true,
    };
    Sheet.properties.defaultRowHeight = 18;
    // Write the codebook
    let Codes = Object.values(Analyses.Codebook);
    // Sort the codes
    Codes = SortCodes(Codes);
    // Write the codes
    for (const Code of Codes) {
        const Categories =
            Code.Categories?.map((Category) =>
                Code.Categories!.length > 1 ? `* ${Category}` : Category,
            ).join("\n") ?? "";
        const Definitions =
            Code.Definitions?.map((Definition) =>
                Code.Definitions!.length > 1 ? `* ${Definition}` : Definition,
            ).join("\n") ?? "";
        const Examples =
            Code.Examples?.map((Example) =>
                Code.Examples!.length > 1
                    ? `* ${Example.replace("|||", ": ")}`
                    : Example.replace("|||", ": "),
            ).join("\n") ?? "";
        const Alternatives = Code.Alternatives?.map((Code) => `* ${Code}`).join("\n") ?? "";
        const Row = Sheet.addRow({
            Label: Code.Label,
            Category: Categories,
            Definition: Definitions,
            Examples,
            Alternatives,
        });
        Row.font = {
            name: "Lato",
            family: 4,
            size: 12,
        };
        Row.height = Math.max(
            30,
            GetRowHeight(Categories, 100),
            GetRowHeight(Definitions, 100),
            GetRowHeight(Examples, 100),
        );
        Row.alignment = { vertical: "middle" };
        Row.getCell("Category").alignment = { vertical: "middle", wrapText: true };
        Row.getCell("Definition").alignment = { vertical: "middle", wrapText: true };
        Row.getCell("Examples").alignment = { vertical: "middle", wrapText: true };
        Row.getCell("Alternatives").alignment = { vertical: "middle", wrapText: true };
    }
}

/** SortCodes: Sort an array of codes. */
export function SortCodes(Codes: Code[]) {
    return [...Codes].sort((A, B) => {
        const Category = (A.Categories?.sort().join("; ") ?? "").localeCompare(
            B.Categories?.sort().join("; ") ?? "",
        );
        return Category !== 0 ? Category : A.Label.localeCompare(B.Label);
    });
}
