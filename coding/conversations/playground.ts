import { ProcessDataset } from "../../analyzer.js";
import { UseLLMs } from "../../utils/llms.js";

let AnalyzerNames = ["bertopic-2", "high-level-1", "high-level-2", "low-level-3", "low-level-5"];
AnalyzerNames = ["low-level-5"];
const Models = ["o1-mini"];

for (const AnalyzerName of AnalyzerNames) {
    var Analyzer = new (await import(`./${AnalyzerName}.js`)).default();

    await UseLLMs(
        async () => {
            await ProcessDataset(Analyzer, "Coded Dataset 1", false);
        },
        ...Models,
    );
}

process.exit(0);
