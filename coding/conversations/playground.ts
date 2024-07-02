import { UseLLMs } from '../../utils/llms.js';
import { ProcessDataset } from '../../analyzer.js';

var AnalyzerNames = ["bertopic-2", "high-level-1", "high-level-2", "low-level-3", "low-level-5"];
AnalyzerNames = ["low-level-5"];
var Models = ["gpt-3.5-turbo", "gpt-4.5-omni", "llama3-70b", "claude3-haiku", "claude3.5-sonnet", "mixtral-8x22b"];
Models = ["llama3-70b"];
// Models = ["gpt-4.5-omni"];
// Models = ["claude3.5-sonnet"];

for (var AnalyzerName of AnalyzerNames) {
    var Analyzer = new (await import(`./${AnalyzerName}.js`)).default;

    await UseLLMs(async () => {
        await ProcessDataset(Analyzer, "Coded Dataset 2", false);
    }, ...Models);
}

process.exit(0);