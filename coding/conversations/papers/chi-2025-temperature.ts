import { ProcessDataset } from "../../../analyzer.js";
import { UseLLMs } from "../../../utils/llms.js";

// This code replicates our study for CHI 2025 regarding the use of different temperatures with the same models.
// Running it requires access to OpenAI, Groq, Claude, and Mistral APIs.
// It also needs access to our dataset, which we will release before the conference.

const AnalyzerNames = ["low-level-5"];
const Models = ["gpt-4.5-mini"]; // "llama3-70b", "gpt-4.5-omni"
const Temperatures = [0, 0.25, 0.5, 0.75, 1]; // 0.5 is already done as the base temperature

for (const AnalyzerName of AnalyzerNames) {
    for (const Temperature of Temperatures) {
        const Analyzer = new (
            (await import(`./../${AnalyzerName}.js`)) as {
                default: new () => Parameters<typeof ProcessDataset>[0];
            }
        ).default();
        Analyzer.Suffix += `-${Temperature}~0.2`; // 0.2 is the weight
        Analyzer.BaseTemperature = Temperature;
        await UseLLMs(
            async () => {
                await ProcessDataset(Analyzer, "Coded Dataset 1", false);
                await ProcessDataset(Analyzer, "Coded Dataset 2", false);
            },
            ...Models,
        );
    }
}

process.exit(0);
