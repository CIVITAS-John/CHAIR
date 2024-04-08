import { Message, Project } from "./schema";

// Export: Export the JSON data into human-readable formats.
// ExportMessages: Export messages into markdown.
export function ExportMessages(Messages: Message[], Originals?: Message[]): string {
    var Result = "";
    for (let I = 0; I < Messages.length; I++) {
        Result += `${I + 1}. **P${Messages[I].SenderID}, ${Messages[I].Nickname}**`;
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
        if (Project.Comments) {
            Result += `\n\n### Comments`;
            Project.Comments!.reverse(); // Here I had a little bug, the original exports have comments in reversed order.
            for (let N = 0; N < Project.Comments.length; N++) {
                var Comment = Project.Comments[N];
                var OriginalComment = Original ? Original.Comments![N] : undefined;
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