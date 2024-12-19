import * as File from "fs";

import * as Mongo from "mongodb";

import { GetDatasetPath } from "../../utils/loader.js";
import type { Comment, Project, User } from "../../utils/schema.js";

import { CutoffDate } from "./message-groups.js";

/** Users: Known users in Physics Lab. */
const Users = new Map<string, User>();
/** ExportUser: Export a user from the database. */
async function ExportUser(
    Database: Mongo.Db,
    ID: Mongo.ObjectId,
    Nickname?: string,
): Promise<User> {
    // If the user is already known, return the user.
    if (Users.has(ID.toHexString())) {
        return Users.get(ID.toHexString())!;
    }
    // Otherwise, read the user from the database.
    const User = (await Database.collection("Users").findOne({ _id: ID }))!;
    const Statistics = (await Database.collection("UserStatistics").findOne({ _id: ID }))!;
    const Result: User = {
        ID: Users.size.toString(),
        Nickname: Nickname ?? User.Nickname,
        Projects: 0,
        Comments: 0,
        FirstUse: Statistics.Registration,
        Titles: [],
    };
    // Sync the verification status at "now" time. - we used Sep 15, 2022 snapshot of Physics Lab's database
    SyncUser(Result, User.Verification, new Date(2022, 9, 15));
    Users.set(ID.toHexString(), Result);
    return Result;
}

/** SyncUser: Synchronize the user with the verification status. */
async function SyncUser(User: User, Verification: string, Time: Date) {
    if (Verification == undefined) {
        return;
    }
    // If the user is banned, old-timer, or moderator, update the user.
    switch (Verification) {
        case "Banned":
            User.Banned = true;
            break;
        case "Oldtimer":
            User.Oldtimer = true;
            break;
        case "":
            break;
        default: {
            User.Oldtimer = true;
            User.Moderator = true;
            break;
        }
    }
    // Update the titles record.
    Time.setUTCHours(0);
    // Insert the title based on the time.
    for (let Index = 0; Index < User.Titles.length; Index++) {
        if (User.Titles[Index][0].getTime() == Time.getTime()) {
            User.Titles[Index][1] = Verification;
            return;
        }
        if (User.Titles[Index][0].getTime() > Time.getTime()) {
            // Consider the previous title.
            if (Index == 0 || User.Titles[Index - 1][1] != Verification) {
                if (User.Titles[Index][1] == Verification) {
                    // Move the title's time earlier if the title is the same.
                    User.Titles[Index][0] = Time;
                } else {
                    // Insert the title if the title is different.
                    User.Titles.splice(Index, 0, [Time, Verification]);
                }
            }
            return;
        }
    }
    // If the title is the latest, add it to the end.
    if (User.Titles.length == 0 || User.Titles[User.Titles.length - 1][1] != Verification) {
        User.Titles.push([Time, Verification]);
    }
}

/** FindMentions: Find the mentions in the content. */
async function FindMentions(
    Database: Mongo.Db,
    Content: string,
): Promise<[string, string[] | undefined]> {
    const Mentioned: string[] = [];
    for (const Match of Content.matchAll(/<user=(.*?)>(.*?)<\/user>/gs)) {
        try {
            await ExportUser(Database, Mongo.ObjectId.createFromHexString(Match[1]));
        } catch {
            console.log(`Invalid ID: ${Match[1]}`);
        }
    }
    return [
        Content.replaceAll(/<user=(.*?)>(.*?)<\/user>/gs, (Match, ID) => {
            if (Users.has(ID)) {
                const Metadata = Users.get(ID)!;
                Mentioned.push(Metadata.ID);
                return `@${Metadata.Nickname}(${Metadata.ID})`;
            }
            return Match;
        }),
        Mentioned.length == 0 ? undefined : Mentioned,
    ];
}

/** ExportComments: Export all comments from the database. */
async function ExportComments(
    Database: Mongo.Db,
    Collection: Mongo.Collection,
    Condition?: Record<string, any>,
): Promise<Comment[] | undefined> {
    // Add the cutoff date and find all
    const ForUsers = Condition == undefined;
    Condition = Condition ?? {};
    Condition.Timestamp = { $lte: CutoffDate.getTime() };
    Condition.Hidden = { $ne: true };
    const Comments = await Collection.find(Condition).toArray();
    if (Comments.length == 0) {
        return undefined;
    }
    // Process the comments
    const Results: Comment[] = [];
    for (const Comment of Comments) {
        // Update the user statistics.
        const User = await ExportUser(Database, Comment.UserID, Comment.Nickname);
        User.Comments++;
        SyncUser(User, Comment.Verification, new Date(Comment.Timestamp));
        if (User.FirstComment == undefined) {
            User.FirstComment = new Date(Comment.Timestamp);
        }
        // Create the comment metadata
        const Metadata: Comment = {
            ID: Comment._id.toHexString(),
            UserID: User.ID,
            Nickname: User.Nickname,
            CurrentNickname: Comment.Nickname == User.Nickname ? undefined : Comment.Nickname,
            Time: new Date(Comment.Timestamp),
            Content: Comment.Content,
        };
        // Find the mentions
        const [Content, Mentioned] = await FindMentions(Database, Metadata.Content);
        Metadata.Content = Content;
        Metadata.Mentions = Mentioned;
        // If this is for users, put it to the relevant user.
        if (ForUsers) {
            const Target = await ExportUser(Database, Comment.TargetID);
            Target.Messages = Target.Messages ?? [];
            Target.Messages.push(Metadata);
        } else {
            // Otherwise, put it to the results.
            Results.push(Metadata);
        }
    }
    return Results;
}

/** Tags: Known tags in Physics Lab. */
const Tags = new Map<string, string>();
/** ExportProjects: Export all projects from the database. */
async function ExportProjects(
    Database: Mongo.Db,
    Collection: Mongo.Collection,
): Promise<Project[]> {
    const Projects = await Collection.find({
        CreationDate: { $lte: CutoffDate.getTime() },
        Visibility: 0,
    }).toArray();
    const Results: Project[] = [];
    // Go through each project.
    for (const Project of Projects) {
        // Update the user statistics.
        const User = await ExportUser(Database, Project.User._id, Project.Nickname);
        User.Projects++;
        SyncUser(User, Project.User.Verification, new Date(Project.UpdateDate));
        if (User.FirstProject == undefined) {
            User.FirstProject = new Date(Project.CreationDate);
        }
        // Create the project metadata
        const ID = Project._id.toHexString();
        const Metadata: Project = {
            ID,
            Category: Project.Category ?? "Experiment",
            UserID: User.ID,
            Nickname: User.Nickname,
            CurrentNickname:
                Project.User.Nickname == User.Nickname ? undefined : Project.User.Nickname,
            Time: new Date(Project.CreationDate),
            Title: Project.Subject,
            Content: Project.Description.join("\n"),
            Visits: Project.Visits,
            Stars: Project.Stars,
            Supports: Project.Supports,
            Remixes: Project.Remixes,
            Tags: Project.Tags.map((Tag: string) => Tags.get(Tag) ?? Tag),
            Cover: `http://physics-static-cn.turtlesim.com/experiments/images/${ID.substring(0, 4)}/${ID.substring(4, 6)}/${ID.substring(
                6,
                8,
            )}/${ID.substring(8, 24)}/${Project.Image}.jpg`,
            Items: 0,
        };
        // Find the mentions
        const [Content, Mentioned] = await FindMentions(Database, Metadata.Content);
        Metadata.Content = Content;
        Metadata.Mentions = Mentioned;
        Metadata.AllItems = await ExportComments(
            Database,
            Database.collection("ExperimentComments"),
            { TargetID: Project._id },
        );
        Metadata.Items = Metadata.AllItems?.length ?? 0;
        // Get the comments
        Results.push(Metadata);
    }
    return Results;
}

/** ExportAll: Export everything from the database. */
async function ExportAll() {
    // Read projects and comments from the database, anonymize user ids, and export into JSON and CSV format.
    const RootPath = `${GetDatasetPath()}\\Projects and Comments`;

    // Connect to the localhost
    const Client = new Mongo.MongoClient("mongodb://127.0.0.1:27017");
    await Client.connect();
    const Database = Client.db("QuantumCN");
    console.log("Connected to the server!");

    // Read the tags
    (await Database.collection("ContentTags").find().toArray()).forEach((Tag) =>
        Tags.set(Tag.Identifier, Tag.Subject.English),
    );

    // Read the projects
    let Projects: Project[] = [];
    Projects = Projects.concat(
        await ExportProjects(Database, Database.collection("ExperimentSummaries")),
    );
    Projects = Projects.concat(await ExportProjects(Database, Database.collection("Discussions")));

    // Read personal messages
    let Messages: Comment[] = [];
    Messages = Messages.concat(
        (await ExportComments(Database, Database.collection("PersonalComments")))!,
    );
    Messages = Messages.concat(
        (await ExportComments(Database, Database.collection("UserComments")))!,
    );

    // Write all projects into a JSON file.
    File.writeFileSync(`${RootPath}\\Projects.json`, JSON.stringify(Projects, null, 4));

    // Write all users into a JSON file.
    const UserArray = Array.from(Users.values());
    File.writeFileSync(`${RootPath}\\Users.json`, JSON.stringify(UserArray, null, 4));

    console.log(
        `Exported ${Users.size} users, their ${Projects.length} projects, ${Projects.reduce(
            (Sum, Project) => Sum + (Project.Items ?? 0),
            0,
        )} comments on projects, and ${UserArray.reduce((Sum, User) => Sum + (User.Messages?.length ?? 0), 0)} personal comments.`,
    );

    // Calculate tokens
    let FullContent = Projects.map((Project) => {
        let Content = Project.Content;
        if (Project.CurrentNickname) {
            Content += `\n${Project.CurrentNickname}`;
        }
        if (Project.AllItems) {
            Content += `\n${Project.AllItems.map((Comment) => {
                let Message = Comment.Content;
                if (Comment.CurrentNickname) {
                    Message += `\n${Comment.CurrentNickname}`;
                }
                return Message;
            }).join("\n")}`;
        }
        return Content;
    }).join("\n");
    FullContent += UserArray.map((User) => {
        let Content = User.Nickname;
        if (User.Messages) {
            Content += `\n${User.Messages.map((Comment) => {
                let Message = Comment.Content;
                if (Comment.CurrentNickname) {
                    Message += `\n${Comment.CurrentNickname}`;
                }
                return Message;
            }).join("\n")}`;
        }
        return Content;
    }).join("\n");

    console.log(`Total characters: ${FullContent.length}`);
    // 1 character ~= 1 token
}

ExportAll().then(() => process.exit(0));
