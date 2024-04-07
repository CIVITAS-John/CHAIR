// This is a playground for selectively translating data.
import * as File from 'fs';
import { GetMessagesPath, GetParticipantsPath, LoadMessages, LoadParticipants } from "../utils/loader";
import { UseLLM } from "./general";
import { TranslateMessages, TranslateParticipants } from "./translate";
import { ExportMessages } from '../utils/export';
import { Message } from '../utils/schema';
import { LLMName } from '../utils/llms';

// UseLLM("mistral-small");
// UseLLM("gpt-3.5-turbo");
UseLLM("gpt-4.5-turbo");
// UseLLM("claude3-haiku");
// UseLLM("claude3-sonnet");
MessagesPlayground("Users of Physics Lab (Group 1)", true).then(() => {
    console.log("Translation done.");
    process.exit(0);
});

/** MessagesPlayground: Translate certain messages from a group. */
async function MessagesPlayground(Group: string, Bilingual: boolean = false) {
    var Messages = LoadMessages(Group);
    var StartDate = new Date(2018, 2, 21);
    var EndDate = new Date(2018, 3, 1);
    // Before we start, we need to translate all participants
    var Participants = LoadParticipants();
    console.log(`Participants to translate: ${Participants.length}`);
    Participants = await TranslateParticipants(Participants);
    // Write into JSON file
    File.writeFileSync(GetParticipantsPath("Participants-Translated.json"), JSON.stringify(Participants, null, 4));
    // By default we don't want system messages
    Messages = Messages.filter(Message => Message.Time >= StartDate && Message.Time < EndDate && Message.SenderID !== "0" && Message.Content !== "");
    var Originals = JSON.parse(JSON.stringify(Messages)) as Message[]; 
    console.log(`Messages to translate: ${Messages.length}`);
    // Translate the messages with LLM
    Messages = await TranslateMessages(Messages, Participants);
    // Write into JSON file
    File.writeFileSync(GetMessagesPath(Group, `Messages-Translated-${LLMName}.json`), JSON.stringify(Messages, null, 4));
    // Write into Markdown file
    File.writeFileSync(GetMessagesPath(Group, `Messages-Translated-${LLMName}.md`), ExportMessages(Messages, Bilingual ? Originals : undefined));
}
