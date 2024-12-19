import { ProcessDataset } from "../../../analyzer.js";
import { UseLLMs } from "../../../utils/llms.js";

// This code replicates our study for CHI 2025 regarding the use of different models with the same analyzers.
// Running it requires access to OpenAI, Groq, Claude, and Mistral APIs.
// It also needs access to our dataset, which we will release before the conference.

// Note that in our study 1, we used low-level-4.
// We later found: for weaker models (compared with GPT-4o), it sometimes failed to enforce the rule (using verb phrases).
// low-level-5 has some minor changes to enforce the rule consistently.
const AnalyzerNames = ["bertopic-1", "high-level-1", "high-level-2", "low-level-3", "low-level-5"];
const Models = [
    "gpt-3.5-turbo",
    "gpt-4.5-omni",
    "llama3-70b",
    "claude3-haiku",
    "claude3.5-sonnet",
    "mixtral-8x22b",
];

for (const AnalyzerName of AnalyzerNames) {
    const Analyzer = new (
        (await import(`./../${AnalyzerName}.js`)) as {
            default: new () => Parameters<typeof ProcessDataset>[0];
        }
    ).default();
    await UseLLMs(
        async () => {
            await ProcessDataset(Analyzer, "Coded Dataset 1", false);
            await ProcessDataset(Analyzer, "Coded Dataset 2", false);
        },
        ...Models,
    );
}

process.exit(0);
