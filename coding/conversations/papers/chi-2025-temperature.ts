import { UseLLMs } from '../../../utils/llms.js';
import { ProcessDataset } from '../../../analyzer.js';

// This code replicates our study for CHI 2025 regarding the use of different models with the same analyzers.
// Running it requires access to OpenAI, Groq, Claude, and Mistral APIs.
// It also needs access to our dataset, which we will release before the conference.

var AnalyzerNames = ["low-level-4"];
var Models = ["gpt-4.5-omni"]; // , "llama3-70b"
var Temperatures = [0, 0.25, 0.75, 1];

for (var AnalyzerName of AnalyzerNames) {
    for (var Temperature of Temperatures) {
        var Analyzer = new (await import(`./../${AnalyzerName}.js`)).default;
        Analyzer.Name += `-temp-${Temperature}`;
        Analyzer.BaseTemperature = Temperature;
        await UseLLMs(async () => {
            await ProcessDataset(Analyzer, "Coded Dataset 1", false);
        }, ...Models);
    }
}

process.exit(0);