import { Code, CodedThread, CodedThreads, Conversation, DataChunk, DataItem, Message, Project } from "./schema.js";
import Excel from 'exceljs';
const { Workbook } = Excel;

// Range: Generate a range of numbers.
export function Range(startAt: number, endAt: number): number[] {
    return [...Array(endAt - startAt + 1).keys()].map(i => i + startAt);
}

// Export: Export the JSON data into human-readable formats.
// ExportMessages: Export messages into markdown.
export function ExportMessages(Messages: Message[], Originals?: Message[]): string {
    var Result = "";
    var LastConversation = "-1";
    for (let I = 0; I < Messages.length; I++) {
        var Message = Messages[I];
        // Write a separator if the time gap is too long
        if (Message.Chunk && LastConversation != Message.Chunk) {
            Result += `\n=== ${Message.Chunk}\n\n`;
            LastConversation = Message.Chunk;
        }
        // Export the message
        Result += `${Message.ID}. **P${Message.UserID}, ${Message.Nickname}**`;
        if (Originals !== undefined && Originals[I].Nickname != Message.Nickname)
            Result += ` (${Originals[I].Nickname})`;
        Result += `: ${Message.Time.toLocaleString("en-US", { timeZone: "Asia/Shanghai" })}\n`
        Result += `${Message.Content}`;
        if (Originals !== undefined && Message.Content != Originals[I].Content) 
            Result += `\n${Originals[I].Content}`;
        Result += "\n";
    }
    return Result;
}

// ExportProjects: Export projects into markdown.
export function ExportProjects(Projects: Project[], Originals?: Project[]): string {
    var Result = "";
    for (let I = 0; I < Projects.length; I++) {
        var Project = Projects[I];
        var Original = Originals ? Originals[I] : undefined;
        // Title
        Result += `## ${Projects[I].Title} (${Projects[I].ID})`;
        if (Original && Original.Title != Project.Title) 
            Result += `* Title: ${Original.Title}\n`;
        // Author
        Result += `\n* Author: P${Projects[I].UserID}, ${Projects[I].Nickname}`;
        if (Original && Original.Nickname != Project.Nickname) 
            Result += ` (${Original.Nickname})`;
        // Tags
        Result += `\n* Tags: ${Projects[I].Tags.join(", ")}`;
        // Time
        Result += `\n* Time: ${Projects[I].Time.toLocaleString("en-US", { timeZone: "Asia/Shanghai" })}`;
        // Visits
        Result += `\n* Popularity: Visits ${Projects[I].Visits ?? 0}, Stars ${Projects[I].Stars ?? 0}, Supports ${Projects[I].Supports ?? 0}`;
        // Image
        Result += `\n![Cover](${Projects[I].Cover})`;
        // Content
        Result += `\n\n### Content\n${Projects[I].Content}`;
        if (Original && Original.Content != Project.Content) 
            Result += `\n${Original.Content}`;
        // Comments
        if (Project.AllItems) {
            Result += `\n\n### Comments`;
            Project.AllItems!.reverse(); // Here I had a little bug, the original exports have comments in reversed order.
            for (let N = 0; N < Project.AllItems.length; N++) {
                var Comment = Project.AllItems[N];
                var OriginalComment = Original ? Original.AllItems![N] : undefined;
                Result += `\n${N + 1}. **P${Comment.UserID}, ${Comment.Nickname}**`;
                if (OriginalComment && Comment.Nickname != OriginalComment.Nickname)
                    Result += ` (${OriginalComment.Nickname})`;
                Result += `: ${Comment.Time.toLocaleString("en-US", { timeZone: "Asia/Shanghai" })}\n`
                Result += `${Comment.Content}`;
                if (OriginalComment && Comment.Content != OriginalComment.Content) 
                    Result += `\n${OriginalComment.Content}`;
            }
        }
        Result += "\n\n";
    }
    return Result;
}

/** GetRowHeight: Get the row height for a given content. */
export function GetRowHeight(Content: string, Width: number): number {
    return Content.split("\n").map(Text => Math.max(1, Math.ceil(Text.length / Width)))
            .reduce((Prev, Curr) => Prev + Curr) * 15 + 3;
}

/** ExportChunksForCoding: Export Chunks into an Excel workbook for coding. */
export function ExportChunksForCoding<T extends DataItem>(Chunks: DataChunk<T>[], Analyses: CodedThreads = { Threads: {} }) {
    var Book = new Workbook();
    var Consolidated = false;
    var Consolidation = new Map<string, string>();
    // Whether the codebook is consolidated
    if (Analyses.Codebook) {
        for (var Code of Object.values(Analyses.Codebook)) {
            if ((Code.Alternatives?.length ?? 0) > 0)
                Code.Alternatives!.forEach(Alternative => Consolidation.set(Alternative, Code.Label));
        }
        Consolidated = Consolidation.size > 0;
    }
    // Export the Chunks
    for (const Chunk of Chunks) {
        var Messages = Chunk.AllItems!;
        var Analysis = Analyses.Threads[Chunk.ID];
        if (!Analysis) Analysis = Analyses.Threads[Chunk.ID.substring(2)];
        // Write into Excel worksheet
        var Sheet = Book.addWorksheet(`${Chunk.ID}`, {
            views:[ { state: 'frozen', xSplit: 1, ySplit: 1 } ]
        });
        // Set the columns
        Sheet.columns = [
            { header: 'ID', key: 'ID', width: 8 },
            { header: 'CID', key: 'CID', width: 6 },
            { header: 'SID', key: 'SID', width: 6 },
            { header: 'Nickname', key: 'Nickname', width: 16 },
            { header: 'Time', key: 'Time', width: 13, style: { numFmt: 'mm/dd hh:MM' } },
            { header: 'In', key: 'In', width: 4 },
            { header: 'Content', key: 'Content', width: 120 },
            { header: 'Codes', key: 'Codes', width: 80 },
            { header: 'Memo', key: 'Memo', width: 80 },
            { header: 'Consolidated', key: 'Consolidated', width: 80 }
        ];
        Sheet.getRow(1).alignment = { vertical: 'middle', wrapText: true };
        Sheet.getRow(1).font = {
            name: 'Lato',
            family: 4,
            size: 12,
            bold: true
        };
        Sheet.properties.defaultRowHeight = 18;
        // Write the messages
        for (let I = 0; I < Messages.length; I++) {
            var Message = Messages[I];
            var Item = Analysis?.Items[Message.ID];
            if (!Item) Item = Analysis?.Items[Message.ID.substring(2)];
            Message.Chunk = Message.Chunk ?? Chunk.ID;
            var Columns: Record<string, any> = {
                ID: Message.ID,
                CID: Message.Chunk,
                SID: Number.isNaN(parseInt(Message.UserID)) ? Message.UserID : parseInt(Message.UserID),
                Nickname: Message.Nickname,
                Time: Message.Time,
                In: Message.Chunk == Chunk.ID ? "Y" : "N",
                Content: Message.Content,
                Codes: Item?.Codes?.join(", ") ?? "",
                Memo: Message.Tags?.join(", ") ?? "",
                Consolidated: [...new Set(Item?.Codes?.map(Code => Consolidation.get(Code) ?? Code) ?? [])].join(", ") ?? ""
            };
            var Row = Sheet.addRow(Columns)
            Row.font = {
                name: 'Lato',
                family: 4,
                size: 12,
                color: { argb:  Message.Chunk == Chunk.ID ? 'FF000000' : 'FF666666' }
            };
            Row.height = GetRowHeight(Message.Content, 120);
            Row.alignment = { vertical: 'middle' };
            Row.getCell("Content").alignment = { vertical: 'middle', wrapText: true };
            Row.getCell("Memo").alignment = { vertical: 'middle', wrapText: true };
        }
        Sheet.addRow({});
        // Extra row for notes
        var AddExtraRow = (ID: number, Name: string, Content: string) => {
            var LastRow = Sheet.addRow({ ID: ID, Nickname: Name, Content: Content });
            LastRow.height = Math.max(30, GetRowHeight(Content, 120));
            LastRow.alignment = { vertical: 'middle' };
            LastRow.getCell("Content").alignment = { vertical: 'middle', wrapText: true };
            LastRow.font = {
                name: 'Lato',
                family: 4,
                size: 12
            };
        }
        AddExtraRow(-1, "Thoughts", Analysis?.Plan ?? "(Optional) Your thoughts before coding the chunk.");
        AddExtraRow(-2, "Summary", Analysis?.Summary ?? "The summary of the chunk.");
        AddExtraRow(-3, "Reflection", Analysis?.Reflection ?? "Your reflections after coding the chunk.");
    }
    // Export the codebook
    ExportCodebook(Book, Analyses);
    return Book;
}

/** ExportCodebook: Export a codebook into an Excel workbook. */
export function ExportCodebook(Book: Excel.Workbook, Analyses: CodedThreads = { Threads: {} }, Name: string = "Codebook") {
    if (Analyses.Codebook == undefined) return;
    var Sheet = Book.addWorksheet(Name, {
        views:[ { state: 'frozen', xSplit: 1, ySplit: 1 } ]
    });
    // Set the columns
    Sheet.columns = [
        { header: 'Label', key: 'Label', width: 30 },
        { header: 'Category', key: 'Category', width: 30 },
        { header: 'Definition', key: 'Definition', width: 80 },
        { header: 'Examples', key: 'Examples', width: 120 },
        { header: 'Alternatives', key: 'Alternatives', width: 40 },
    ];
    Sheet.getRow(1).alignment = { vertical: 'middle', wrapText: true };
    Sheet.getRow(1).font = {
        name: 'Lato',
        family: 4,
        size: 12,
        bold: true
    };
    Sheet.properties.defaultRowHeight = 18;
    // Write the codebook
    var Codes = Object.values(Analyses.Codebook);
    // Sort the codes
    Codes = SortCodes(Codes);
    // Write the codes
    for (var Code of Codes) {
        var Categories = Code.Categories?.map(Category => Code.Categories!.length > 1 ? `* ${Category}` : Category).join("\n") ?? "";
        var Definitions = Code.Definitions?.map(Definition => Code.Definitions!.length > 1 ? `* ${Definition}` : Definition).join("\n") ?? "";
        var Examples = Code.Examples?.map(Example => Code.Examples!.length > 1 ? `* ${Example.replace("|||", ": ")}` : Example.replace("|||", ": ")).join("\n") ?? "";
        var Alternatives = Code.Alternatives?.map(Code => `* ${Code}`).join("\n") ?? "";
        var Row = Sheet.addRow({
            Label: Code.Label,
            Category: Categories,
            Definition: Definitions,
            Examples: Examples,
            Alternatives: Alternatives
        });
        Row.font = {
            name: 'Lato',
            family: 4,
            size: 12
        };
        Row.height = Math.max(30, GetRowHeight(Categories, 100), GetRowHeight(Definitions, 100), GetRowHeight(Examples, 100));
        Row.alignment = { vertical: 'middle' };
        Row.getCell("Category").alignment = { vertical: 'middle', wrapText: true };
        Row.getCell("Definition").alignment = { vertical: 'middle', wrapText: true };
        Row.getCell("Examples").alignment = { vertical: 'middle', wrapText: true };
        Row.getCell("Alternatives").alignment = { vertical: 'middle', wrapText: true };
    }
}

/** SortCodes: Sort an array of codes. */
export function SortCodes(Codes: Code[]) {
    return [...Codes].sort((A, B) => {
        var Category = (A.Categories?.sort().join("; ") ?? "").localeCompare(B.Categories?.sort().join("; ") ?? "");
        return Category != 0 ? Category : A.Label.localeCompare(B.Label);
    });
}