import { MaxOutput } from "../../utils/llms.js";
import type { Comment, Project } from "../../utils/schema.js";

import { TranslateStrings } from "./general.js";

// TranslateProjects: Translate a bunch of projects.
export async function TranslateProjects(Projects: Project[]): Promise<Project[]> {
    // Mappings: ID => Name
    const UserMappings = new Map<string, string>();
    // Get names to translate
    const Nicknames = new Set<string>();
    for (const Project of Projects) {
        Nicknames.add(Project.Nickname);
        if (Project.CurrentNickname) {
            Nicknames.add(Project.CurrentNickname);
        }
        if (Project.AllItems) {
            for (const Comment of Project.AllItems) {
                Nicknames.add(Comment.Nickname);
                if (Comment.CurrentNickname) {
                    Nicknames.add(Comment.CurrentNickname);
                }
            }
        }
    }

    // Handle the mentioned users (=> @ID)
    const HandleContent = (Content: string) => {
        return Content.replaceAll(
            /(回复)?@(.*?)\((\d+)\)(?:\s|$|:)/g,
            (_Match, Reply, Name: string, ID: string) => {
                UserMappings.set(ID, Name);
                Nicknames.add(Name);
                if (Reply) {
                    return `Reply @${ID}:`;
                }
                return `@${ID} `;
            },
        );
    };
    // Get the contents to translate
    const Contents = Projects.map((Project) => {
        Project.Content = HandleContent(Project.Content);
        // For comments
        Project.AllItems?.forEach((Comment) => {
            Comment.Content = HandleContent(Comment.Content);
            return Comment.Content;
        });
        // Truncate the message if it's too long
        // Here we leave some rooms since the model might need more tokens than the source text to translate
        Project.Content = `${Project.Title}\n${Project.Content}`;
        if (Project.Content.length >= MaxOutput * 0.75) {
            Project.Content = `${Project.Content.substring(0, MaxOutput * 0.75)} (Too long to translate)`;
        }
        return Project.Content;
    });

    // Translate the nicknames and contents
    const NicknameArrays = Array.from(Nicknames);
    const TranslatedNicknames = await TranslateStrings("nickname", NicknameArrays);
    const NameTranslations = new Map<string, string>();
    TranslatedNicknames.forEach((Translation, Index) =>
        NameTranslations.set(NicknameArrays[Index], Translation),
    );
    // Translate the and contents
    const TranslatedContents = await TranslateStrings("contents", Contents);
    // Assign the translated nicknames and contents
    for (let I = 0; I < Projects.length; I++) {
        // Decipher the nicknames
        Projects[I].Nickname = NameTranslations.get(Projects[I].Nickname)!;
        if (Projects[I].CurrentNickname) {
            Projects[I].CurrentNickname = NameTranslations.get(Projects[I].CurrentNickname!)!;
        }
        // Handle the mentioned users (=> @Nickname (ID))
        let Content = TranslatedContents[I];
        Content = Content.replaceAll(/@(\d+)(\s|$|:)/g, (_Match, ID: string, Ends) => {
            if (UserMappings.has(ID)) {
                return `@${NameTranslations.get(UserMappings.get(ID)!)!} (${ID})${Ends}`;
            }
            return `@${ID}${Ends}`;
        });
        Projects[I].Title = Content.split("\n")[0].trim();
        Projects[I].Content = Content.substring(Projects[I].Title.length + 1).trim();
        if (Projects[I].AllItems) {
            Projects[I].AllItems = await TranslateComments(
                Projects[I].AllItems!,
                UserMappings,
                NameTranslations,
            );
        }
    }
    return Projects;
}

// TranslateComments: Translate a bunch of comments.
export async function TranslateComments(
    Comments: Comment[],
    UserMappings: Map<string, string>,
    NameTranslations: Map<string, string>,
): Promise<Comment[]> {
    const Contents = Comments.map((Comment) => {
        if (Comment.Content.length >= MaxOutput * 0.75) {
            Comment.Content = `${Comment.Content.substring(0, MaxOutput * 0.75)} (Too long to translate)`;
        }
        return Comment.Content;
    });
    const TranslatedContents = await TranslateStrings("messages", Contents);
    for (let I = 0; I < Comments.length; I++) {
        // Decipher the nicknames
        Comments[I].Nickname = NameTranslations.get(Comments[I].Nickname)!;
        if (Comments[I].CurrentNickname) {
            Comments[I].CurrentNickname = NameTranslations.get(Comments[I].CurrentNickname!)!;
        }
        // Handle the mentioned users (=> @Nickname (ID))
        let Content = TranslatedContents[I];
        Content = Content.replaceAll(/@(\d+)(\s|$|:)/g, (_Match, ID: string, Ends) => {
            if (UserMappings.has(ID)) {
                return `@${NameTranslations.get(UserMappings.get(ID)!)!} (${ID})${Ends}`;
            }
            return `@${ID}${Ends}`;
        });
        Comments[I].Content = Content;
    }
    return Comments;
}
