import { ProcessDataset } from "../../../analyzer.js";
import { UseLLMs } from "../../../utils/llms.js";

// This code replicates our study for CHI 2025 regarding resampling the same model for multiple times.
// Running it requires access to OpenAI, Groq, Claude, and Mistral APIs.
// It also needs access to our dataset, which we will release before the conference.

const AnalyzerNames = ["low-level-5"];
const Models = ["gpt-4.5-mini"]; // "llama3-70b", "gpt-4.5-omni"

for (const AnalyzerName of AnalyzerNames) {
    for (let I = 0; I < 5; I++) {
        const Analyzer = new (
            (await import(`./../${AnalyzerName}.js`)) as {
                default: new () => Parameters<typeof ProcessDataset>[0];
            }
        ).default();
        Analyzer.Suffix += "~0.2"; // 0.2 is the weight
        await UseLLMs(
            async () => {
                await ProcessDataset(Analyzer, "Coded Dataset 1", false);
                await ProcessDataset(Analyzer, "Coded Dataset 2", false);
            },
            ...Models.map((Model) => `${Model}_${I}`),
        );
    }
}

process.exit(0);
