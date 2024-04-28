import { ResearchQuestion } from '../../constants.js';
import { Code, CodedThread, Conversation, Message } from '../../utils/schema.js';
import { BuildMessagePrompt } from './conversations.js';
import { HighLevelAnalyzerBase } from './high-level.js';

/** HighLevelAnalyzer3: Conduct the first-round high-level coding of the conversations. */
/* Original prompt format:
Identify up to 3 most relevant themes in the text, provide a name for each theme in no more than 3 words, 4 lines meaningful and desnse description of the theme and a quote from the respondent for each theme no longer than 7 lines. Format the response as a json file keeping names, descriptions, and quotes together in the json, and keep them together in 'Themes'.
---
De Paoli, S.: Performing an Inductive Thematic Analysis of Semi-Structured Interviews
With a Large Language Model: An Exploration and Provocation on the Limits of the
Approach. Social Science Computer Review, 08944393231220483 (2023).
*/
export class HighLevelAnalyzer3 extends HighLevelAnalyzerBase {
    /** Name: The name of the analyzer. */
    public Name: string = "high-level-3";
    /** BaseTemperature: The base temperature for the LLM. */
    public BaseTemperature: number = 0.5;
    /** BuildPrompts: Build the prompts for the LLM. */
    public async BuildPrompts(Analysis: CodedThread, Target: Conversation, Messages: Message[], ChunkStart: number): Promise<[string, string]> {
        return [`
Hi ChatGPT, I want to analyze the following interaction in one of Physics Lab's online message groups.
Please give me a codebook to analyze factors within this interaction that could contribute to the research.
${ResearchQuestion}
For each code, try to find 3 quotes. Always follow the output format:
---
* Summary
{A summary of the conversation}

* Plan
{A paragraph of plans and guiding questions about analyzing the conversation from multiple theoretical angles}

# Label of category 1
## Label of code 1
Definition: A definition of code 1
- Example quote 1
- Example quote 2

## ...
# ...
`.trim(),
            Messages.map((Message, Index) => `${Index + 1}. ${BuildMessagePrompt(Message)}`).join("\n")];
    }
}