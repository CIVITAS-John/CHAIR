import { UseLLMs } from "../../utils/llms.js";
import { ProcessDataset } from "../../analyzer.js";

let AnalyzerNames = ["bertopic-2", "high-level-1", "high-level-2", "low-level-3", "low-level-5"];
AnalyzerNames = ["low-level-5"];
const Models = ["o1-mini"];

for (const AnalyzerName of AnalyzerNames) {
    const Analyzer = new (
        (await import(`./${AnalyzerName}.js`)) as {
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
