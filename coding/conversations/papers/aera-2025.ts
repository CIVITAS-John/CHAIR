import { ProcessDataset } from "../../../analyzer.js";
import { UseLLMs } from "../../../utils/llms.js";

// This code replicates our study for AERA 2025 and CSCL 2025.
// Running it requires access to OpenAI, Groq, Claude, and Mistral APIs.
// It also needs access to our dataset, which we will release before the conference.

const AnalyzerNames = ["bertopic-1", "high-level-1", "high-level-2", "low-level-3", "low-level-5"];
const Models = ["gpt-4.5-omni"];

for (const AnalyzerName of AnalyzerNames) {
    const Analyzer = new (
        (await import(`./../${AnalyzerName}.js`)) as {
            default: new () => Parameters<typeof ProcessDataset>[0];
        }
    ).default();
    await UseLLMs(
        async () => {
            await ProcessDataset(Analyzer, "Coded Dataset 1", false);
        },
        ...Models,
    );
}

process.exit(0);
