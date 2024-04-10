import * as File from 'fs';
import { ExportMessages } from "../utils/export.js";
import { GetMessagesPath, LoadMessages } from "../utils/loader.js";

// @ts-ignore
import { density1d } from 'fast-kde';

SeperateMessages("Users of Physics Lab (Group 1)");

/** SeperateMessages: Seperate messages into conversations from a group. */
function SeperateMessages(Group: string) {
    var Messages = LoadMessages(Group);
    // Calculate timestamp differences between messages
    var Times = Messages.map(Message => Message.Time.getTime());
    var CurrentGroup = [ Times[0] ];
    var Groups = [ CurrentGroup ];
    // Separate messages into conversation groups whenever the gap is larger than 1 day
    for (let I = 1; I < Times.length; I++) {
        var Difference = Times[I] - Times[I - 1];
        if (Difference > 24 * 60 * 60 * 1000) {
            CurrentGroup = [ Times[I] ];
            Groups.push(CurrentGroup);
        } else {
            CurrentGroup.push(Times[I]);
        }
    }
    // Log the conversation groups
    console.log(Groups.map(Group => Group.length).join(", "));
    // Calculate the KDE in each group
    for (const Group of Groups) {
        console.log(density1d(Group));
    }
    // Write into Markdown file
    // File.writeFileSync(GetMessagesPath(Group, `Messages.md`), ExportMessages(Messages.filter(Message => Message.SenderID != "0")));
}