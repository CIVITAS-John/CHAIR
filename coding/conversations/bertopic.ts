import * as File from 'fs';
import { CodedThread, Conversation, Message } from '../../utils/schema.js';
import { BuildMessagePrompt, ConversationAnalyzer } from './conversations.js';
import { PythonShell } from 'python-shell';
import chalk from 'chalk';

/** BertopicAnalyzer: Conduct the first-round bertopic coding of the conversations. */
// Authored by John Chen.
export default class BertopicAnalyzer extends ConversationAnalyzer {
    /** Name: The name of the analyzer. */
    public Name: string = "bertopic";
    /** BaseTemperature: The base temperature for the LLM. */
    public async BatchPreprocess(Conversations: Conversation[], Analyzed: CodedThread[]): Promise<void> {
        // Write the messages into the file.
        var Messages = Conversations.flatMap(Conversation => 
            Conversation.AllItems!.filter(Message => Message.Content.length > 0 && Message.Chunk == Conversation.ID));
        var Content = Messages.map(Message => Message.Content.replace(/\n/g, " "));
        File.writeFileSync("./known/temp.text", Content.join("\n"));
        // Run the Python script
        await PythonShell.run(`coding/conversations/bertopic-impl.py`, {
            args: [Messages.length.toString()],
            parser: (Message) => { 
                console.log(chalk.gray(Message));
            }
        });
    }
}