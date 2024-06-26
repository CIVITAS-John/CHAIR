import { UseLLMs } from '../../../utils/llms.js';
import { ProcessDataset } from '../../../analyzer.js';

// This code replicates our study for CHI 2025.
// Running it requires access to OpenAI, Groq, Claude, and Mistral APIs.
// It also needs access to our dataset, which we will release before the conference.

var AnalyzerNames = ["bertopic-2", "high-level-3", "low-level-3", "low-level-4"];
var Models = ["gpt-3.5-turbo", "gpt-4.5-omni", "llama3-70b", "claude3-haiku", "claude3.5-sonnet", "mixtral-8x22b"];

for (var AnalyzerName of AnalyzerNames) {
    var Analyzer = new (await import(`./../${AnalyzerName}.js`)).default;
    await UseLLMs(async () => {
        await ProcessDataset(Analyzer, "Coded Dataset 1", false);
    }, ...Models);
}

process.exit(0);