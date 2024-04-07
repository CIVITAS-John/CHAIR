import { Message } from "./schema";

// Export: Export the JSON data into human-readable formats.
// ExportMessages: Export messages into markdown.
export function ExportMessages(Messages: Message[], Originals?: Message[]): string {
    var Result = "";
    for (let I = 0; I < Messages.length; I++) {
        Result += `**${Messages[I].Nickname}**`;
        if (Originals !== undefined && Originals[I].Nickname != Messages[I].Nickname)
            Result += ` (${Originals[I].Nickname})`;
        Result += `: ${Messages[I].Time.toLocaleString("en-US", { timeZone: "Asia/Shanghai" })}\n`
        Result += `${Messages[I].Content}`;
        if (Originals !== undefined && Messages[I].Content != Originals[I].Content) 
            Result += `\n${Originals[I].Content}`;
        Result += "\n";
    }
    return Result;
}