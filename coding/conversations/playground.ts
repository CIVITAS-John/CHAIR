import { UseLLMs } from '../../utils/llms.js';
import { ProcessDataset } from '../../analyzer.js';

var AnalyzerNames = ["bertopic-1", "high-level-3", "low-level-4"];
AnalyzerNames = ["low-level-4"];
var Models = ["gpt-3.5-turbo", "gpt-4.5-turbo", "llama3-70b", "claude3-haiku", "claude3.5-sonnet", "mixtral-8x22b"];
// Models = ["llama3-70b"];
// Models = ["claude3.5-sonnet"];

for (var AnalyzerName of AnalyzerNames) {
    var Analyzer = new (await import(`./${AnalyzerName}.js`)).default;

    await UseLLMs(async () => {
        await ProcessDataset(Analyzer, "Coded Dataset 1", false);
    }, ...Models);
}

process.exit(0);