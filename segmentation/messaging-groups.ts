import * as File from 'fs';
import { GetMessagesPath, LoadMessages } from "../utils/loader.js";
import { ExportMessages } from '../utils/export.js';
import spawnAsync from '@expo/spawn-async';

await SeperateMessages("Users of Physics Lab (Group 1)");

/** SeperateMessages: Seperate messages into conversations from a group. */
async function SeperateMessages(Source: string) {
    // Call the Python script
    var Python = spawnAsync('python', ['segmentation/messaging-groups.py', GetMessagesPath(Source, "Messages.csv")]);
    Python.child.stdout!.on('data', (data) => {
        console.log(`${data}`);
    });
    Python.child.stderr!.on('data', (data) => {
        console.error(`${data}`);
    });
    // Load messages
    var Messages = LoadMessages(Source).filter(Message => Message.SenderID != "0").splice(0, 2000);
    // Break up messages based on the indexes
    var Indexes = File.readFileSync(GetMessagesPath(Source, `Messages.Groups.csv`), 'utf-8').split('\n').map(Index => Number(Index));
    for (var I = 0; I < Indexes.length; I++) {
        for (var J = I == 0 ? 0 : Indexes[I - 1] + 1; J <= Indexes[I]; J++) {
            if (J >= Messages.length) break;
            Messages[J].Conversation = I;
        }
    }
    // Write into Markdown file
    File.writeFileSync(GetMessagesPath(Source, `Messages.md`), ExportMessages(Messages));
}