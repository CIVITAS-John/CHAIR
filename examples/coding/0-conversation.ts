import { ProcessDataset } from "../../analyzer.js";
import { UseLLM } from "../../utils/llms.js";

// Loads the low-level-5 analyzer
var Analyzer = new (await import(`./../../coding/conversations/low-level-5.js`)).default();
// Uses the gpt-4o model (can be changed to any other model)

UseLLM("gpt-4.5-omni");
// Processes the dataset with the analyzer
await ProcessDataset(Analyzer, "Conversation-Example", false);

process.exit(0);
