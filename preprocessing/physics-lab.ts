import * as File from 'fs';
import { CutoffDate, DatasetPath } from '../constants';
import * as Mongo from 'mongodb';

/** Message: A message in a group chat. */
interface Project {
    /** ID: The ID of the project. */
    ID: string;
    /** Category: The category of the project. */
    Category: string;
    /** UserID: The ID of the user who created the project. */
    UserID: string;
    /** Nickname: The nickname of the user who created the project. */
    Nickname: string;
    /** CurrentNickname: The current nickname at the time of sharing. */
    CurrentNickname?: string;
    /** Time: The time the message was sent. */
    Time: Date;
    /** Title: Title of the project. */
    Title: string;
    /** Content: The content of the project. */
    Content: string;
    /** Visits: Number of total visits (until now, not the cutoff date). */
    Visits: number;
    /** Stars: Number of total stars (until now, not the cutoff date). */
    Stars: number;
    /** Supports: Number of total supports (until now, not the cutoff date). */
    Supports: number;
    /** Remixes: Number of total remixes (until now, not the cutoff date). */
    Remixes: number;
    /** Mentioned: The users mentioned by this project. */
    Mentioned?: string[];
    /** Cover: The cover image of the project. */
    Cover: string,
    /** Comments: Comments on the project. */
    Comments?: Comment[];
}

/** Comment: A comment on a project or a user. */
interface Comment {
    /** ID: The ID of the project. */
    ID: string;
    /** UserID: The ID of the user who created the project. */
    UserID: string;
    /** Nickname: The nickname of the user who posted the comment. */
    Nickname: string;
    /** CurrentNickname: The current nickname at the time of posting. */
    CurrentNickname?: string;
    /** Time: The time the message was sent. */
    Time: Date;
    /** Content: The content of the project. */
    Content: string;
    /** Mentioned: The users mentioned by this project. */
    Mentioned?: string[];
}

/** User: A user in Physics Lab. */
interface User {
    /** ID: The ID of the user. */
    ID: string;
    /** Nickname: The initial nickname of the user. */
    Nickname: string;
    /** Projects: The number of projects sent by the user. */
    Projects: number;
    /** Comments: The number of comments sent by the user. */
    Comments: number;
    /** FirstUse: The time the user first used the app. */
    FirstUse: Date;
    /** FirstProject: The time the user first shared a project in the community. */
    FirstProject?: Date;
    /** FirstComment: The time the user first commented in the community. */
    FirstComment?: Date;
    /** IsBanned: Whether the user is, or was, banned. */
    Banned: boolean;
    /** Oldtimer: Whether the user is, or was, an old-timer. */
    Oldtimer: boolean;
    /** IsModerator: Whether the user is, or was, a moderator. */
    Moderator: boolean;
    /** Messages: Messages on the profile. */
    Messages?: Comment[];
}

/** Users: Known users in Physics Lab. */
const Users = new Map<string, User>();
/** ExportUser: Export a user from the database. */
async function ExportUser(Database: Mongo.Db, ID: Mongo.ObjectId, Nickname?: string): Promise<User> {
    // If the user is already known, return the user.
    if (Users.has(ID.toHexString())) return Users.get(ID.toHexString())!;
    // Otherwise, read the user from the database.
    var User = (await Database.collection("Users").findOne({ _id: ID }))!;
    var Statistics = (await Database.collection("UserStatistics").findOne({ _id: ID }))!;
    var Result: User = {
        ID: Users.size.toString(),
        Nickname: Nickname ?? User.Nickname,
        Projects: 0,
        Comments: 0,
        FirstUse: Statistics.Registration,
        Banned: User.Verification == "Banned",
        Oldtimer: User.Verification == "Oldtimer",
        Moderator: User.Verification != "Banned" && User.Verification != "" && User.Verification != "Oldtimer" && User.Verification != undefined
    }
    if (Result.Moderator) Result.Oldtimer = true;
    Users.set(ID.toHexString(), Result);
    return Result;
}

/** SyncUser: Synchronize the user with the verification status. */
async function SyncUser(User: User, Verification: string) {
    if (Verification != undefined && Verification != "") {
        User.Oldtimer = true;
        User.Moderator = true;
    }
    if (Verification == "Oldtimer")
        User.Oldtimer = true;
}

/** FindMentions: Find the mentions in the content. */
async function FindMentions(Database: Mongo.Db, Content: string): Promise<[string, string[] | undefined]> {
    var Mentioned: string[] = [];
    for (var Match of Content.matchAll(/<user=(.*?)>(.*?)<\/user>/gs)) {
        try {
            await ExportUser(Database, Mongo.ObjectId.createFromHexString(Match[1]));
        } catch {
            console.log(`Invalid ID: ${Match[1]}`);
        }
    }
    return [Content.replaceAll(/<user=(.*?)>(.*?)<\/user>/gs, (Match, ID) => {
        if (Users.has(ID)) {
            var Metadata = Users.get(ID)!;
            Mentioned.push(Metadata.ID);
            return `@${Metadata.Nickname}(${Metadata.ID})`
        } else return Match;
    }), Mentioned.length == 0 ? undefined : Mentioned];
}

/** ExportComments: Export all comments from the database. */
async function ExportComments(Database: Mongo.Db, Collection: Mongo.Collection, Condition?: Record<string, any>): Promise<Comment[] | undefined> {
    // Add the cutoff date and find all
    var ForUsers = Condition == undefined;
    Condition = Condition ?? {};
    Condition.Timestamp = { $lte: CutoffDate.getTime() };
    Condition.Hidden = { $ne: true };
    var Comments = await Collection.find(Condition).toArray();
    if (Comments.length == 0) return undefined;
    // Process the comments
    var Results: Comment[] = [];
    for (var Comment of Comments) {
        // Update the user statistics.
        var User = await ExportUser(Database, Comment.UserID, Comment.Nickname);
        User.Comments++;
        SyncUser(User, Comment.Verification);
        if (User.FirstComment == undefined) 
            User.FirstComment = new Date(Comment.Timestamp);
        // Create the comment metadata
        var Metadata: Comment = {
            ID: Comment._id.toHexString(),
            UserID: User.ID,
            Nickname: User.Nickname,
            CurrentNickname: Comment.Nickname == User.Nickname ? undefined : Comment.Nickname,
            Time: new Date(Comment.Timestamp),
            Content: Comment.Content
        }
        // Find the mentions
        var [Content, Mentioned] = await FindMentions(Database, Metadata.Content);
        Metadata.Content = Content;
        Metadata.Mentioned = Mentioned;
        // If this is for users, put it to the relevant user.
        if (ForUsers) {
            var Target = await ExportUser(Database, Comment.TargetID);
            Target.Messages = Target.Messages ?? [];
            Target.Messages.push(Metadata);
        } else {
            // Otherwise, put it to the results.
            Results.push(Metadata);
        }
    }
    return Results;
}

/** ExportProjects: Export all projects from the database. */
async function ExportProjects(Database: Mongo.Db, Collection: Mongo.Collection): Promise<Project[]> {
    var Projects = await Collection.find({
        CreationDate: { $lte: CutoffDate.getTime() },
        Visibility: 0
    }).toArray();
    var Results: Project[] = [];
    // Go through each project.
    for (var Project of Projects) {
        // Update the user statistics.
        var User = await ExportUser(Database, Project.User._id, Project.Nickname);
        User.Projects++;
        SyncUser(User, Project.User.Verification);
        if (User.FirstProject == undefined) 
            User.FirstProject = new Date(Project.CreationDate);
        // Create the project metadata
        var ID = Project._id.toHexString();
        var Metadata: Project = {
            ID: ID,
            Category: Project.Category ?? "Experiment",
            UserID: User.ID,
            Nickname: User.Nickname,
            CurrentNickname: Project.User.Nickname == User.Nickname ? undefined : Project.User.Nickname,
            Time: new Date(Project.CreationDate),
            Title: Project.Subject,
            Content: Project.Description.join("\n"),
            Visits: Project.Visits,
            Stars: Project.Stars,
            Supports: Project.Supports,
            Remixes: Project.Remixes,
            Cover: `http://physics-static-cn.turtlesim.com/experiments/images/${ID.substring(0, 4)}/${ID.substring(4, 6)}/${ID.substring(6, 8)}/${ID.substring(8, 24)}/${Project.Image}.jpg`
        }
        // Find the mentions
        var [Content, Mentioned] = await FindMentions(Database, Metadata.Content);
        Metadata.Content = Content;
        Metadata.Mentioned = Mentioned;
        Metadata.Comments = await ExportComments(Database, 
            Database.collection("ExperimentComments"), { TargetID: Project._id })
        // Get the comments
        Results.push(Metadata);
    }
    return Results;
}

/** ExportAll: Export everything from the database. */
async function ExportAll() {
    // Read projects and comments from the database, anonymize user ids, and export into JSON and CSV format.
    const RootPath = `${DatasetPath}\\Projects and Comments`;
    
    // Connect to the localhost
    const Client = new Mongo.MongoClient('mongodb://127.0.0.1:27017');
    await Client.connect();
    const Database = Client.db('QuantumCN');
    console.log("Connected to the server!");
    
    // Read the projects
    var Projects: Project[] = [];
    Projects = Projects.concat(await ExportProjects(Database, Database.collection("ExperimentSummaries")));
    Projects = Projects.concat(await ExportProjects(Database, Database.collection("Discussions")));
    
    // Read personal messages
    var Messages: Comment[] = [];
    Messages = Messages.concat((await ExportComments(Database, Database.collection("PersonalComments")))!);
    Messages = Messages.concat((await ExportComments(Database, Database.collection("UserComments")))!);

    // Write all projects into a JSON file.
    File.writeFileSync(`${RootPath}\\Projects.json`, JSON.stringify(Projects, null, 4));

    // Write all users into a JSON file.
    var UserArray = Array.from(Users.values());
    File.writeFileSync(`${RootPath}\\Users.json`, JSON.stringify(UserArray, null, 4));

    console.log(`Exported ${Users.size} users, their ${Projects.length} projects, ${Projects.reduce((Sum, Project) => Sum + (Project.Comments?.length ?? 0), 0)} comments on projects, and ${UserArray.reduce((Sum, User) => Sum + (User.Messages?.length ?? 0), 0)} personal comments.`);
}

ExportAll().then(() => process.exit(0));