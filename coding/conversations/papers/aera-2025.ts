import { UseLLMs } from '../../../utils/llms.js';
import { ProcessDataset } from '../../../analyzer.js';

// This code replicates our study for AERA 2025 and CHI 2025 (pilot).
// Running it requires access to OpenAI, Groq, Claude, and Mistral APIs.
// It also needs access to our dataset, which we will release before the conference.

var AnalyzerNames = ["bertopic-1", "high-level-1", "high-level-2", "low-level-3"];
AnalyzerNames = ["bertopic-1"];
var Models = ["gpt-4.5-omni"];

for (var AnalyzerName of AnalyzerNames) {
    var Analyzer = new (await import(`./../${AnalyzerName}.js`)).default;
    await UseLLMs(async () => {
        await ProcessDataset(Analyzer, "Coded Dataset 1", false);
    }, ...Models);
}

process.exit(0);