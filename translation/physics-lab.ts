import { MaxOutput } from '../utils/llms';
import { Project, Comment } from '../utils/schema';
import { TranslateStrings } from "./general";

// TranslateProjects: Translate a bunch of projects.
export async function TranslateProjects(Projects: Project[]): Promise<Project[]> {
    // Mappings: ID => Name
    var UserMappings = new Map<string, string>();
    // Get names to translate
    var Nicknames = new Set<string>();
    for (let Project of Projects) {
        Nicknames.add(Project.Nickname);
        if (Project.CurrentNickname) Nicknames.add(Project.CurrentNickname);
        if (Project.Comments) {
            for (let Comment of Project.Comments) {
                Nicknames.add(Comment.Nickname);
                if (Comment.CurrentNickname) Nicknames.add(Comment.CurrentNickname);
            }
        }
    }

    // Get the contents to translate
    var Contents = Projects.map((Project) => {
        // Handle the mentioned users (=> @ID)
        Project.Content = Project.Content.replaceAll(/(回复)?@(.*?)\((\d+)\)(\s|$|:)/g, (Match, Reply, Name, ID) => {
            UserMappings.set(ID, Name);
            Nicknames.add(Name);
            if (Reply) {
                return `Reply @${ID}:`;
            } else return `@${ID} `;
        });
        // For comments
        Project.Comments?.forEach((Comment) => {
            // Handle the mentioned users (=> @ID)
            Comment.Content = Comment.Content.replaceAll(/(回复)?@(.*?)\((\d+)\)(\s|$|:)/g, (Match, Reply, Name, ID) => {
                UserMappings.set(ID, Name);
                Nicknames.add(Name);
                if (Reply) {
                    return `Reply @${ID}:`;
                } else return `@${ID} `;
            });
            return Comment.Content;
        });
        // Truncate the message if it's too long
        // Here we leave some rooms since the model might need more tokens than the source text to translate
        Project.Content = `${Project.Title}\n${Project.Content}`;
        if (Project.Content.length >= MaxOutput * 0.75) 
            Project.Content = Project.Content.substring(0, MaxOutput * 0.75) + " (Too long to translate)";
        return Project.Content;
    });

    // Translate the nicknames and contents
    var NicknameArrays = Array.from(Nicknames);
    var TranslatedNicknames = await TranslateStrings("nickname", NicknameArrays);
    var NameTranslations = new Map<string, string>();
    TranslatedNicknames.forEach((Translation, Index) => NameTranslations.set(NicknameArrays[Index], Translation));
    // Translate the and contents
    var TranslatedContents = await TranslateStrings("contents", Contents);
    // Assign the translated nicknames and contents
    for (let I = 0; I < Projects.length; I++) {
        // Decipher the nicknames
        Projects[I].Nickname = NameTranslations.get(Projects[I].Nickname)!;
        if (Projects[I].CurrentNickname) 
            Projects[I].CurrentNickname = NameTranslations.get(Projects[I].CurrentNickname!)!;
        // Handle the mentioned users (=> @Nickname (ID))
        var Content = TranslatedContents[I];
        Content = Content.replaceAll(/@(\d+)(\s|$|:)/g, (Match, ID, Ends) => {
            if (UserMappings.has(ID)) {
                return `@${NameTranslations.get(UserMappings.get(ID)!)!} (${ID})${Ends}`;
            } else return `@${ID}${Ends}`;
        });
        Projects[I].Title = Content.split("\n")[0].trim();
        Projects[I].Content = Content.substring(Projects[I].Title.length + 1).trim();
        if (Projects[I].Comments) 
            Projects[I].Comments = await TranslateComments(Projects[I].Comments!, UserMappings, NameTranslations);
    }
    return Projects;
}

// TranslateComments: Translate a bunch of comments.
export async function TranslateComments(Comments: Comment[], UserMappings: Map<string, string>, NameTranslations: Map<string, string>): Promise<Comment[]> {
    var Contents = Comments.map((Comment) => Comment.Content);
    var TranslatedContents = await TranslateStrings("messages", Contents);
    for (let I = 0; I < Comments.length; I++) {
        // Decipher the nicknames
        Comments[I].Nickname = NameTranslations.get(Comments[I].Nickname)!;
        if (Comments[I].CurrentNickname) 
            Comments[I].CurrentNickname = NameTranslations.get(Comments[I].CurrentNickname!)!;
        // Handle the mentioned users (=> @Nickname (ID))
        var Content = TranslatedContents[I];
        Content = Content.replaceAll(/@(\d+)(\s|$|:)/g, (Match, ID, Ends) => {
            if (UserMappings.has(ID)) {
                return `@${NameTranslations.get(UserMappings.get(ID)!)!} (${ID})${Ends}`;
            } else return `@${ID}${Ends}`;
        });
        Comments[I].Content = Content;
    }
    return Comments;
}