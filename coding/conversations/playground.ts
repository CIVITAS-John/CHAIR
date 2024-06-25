import { UseLLMs } from '../../utils/llms.js';
import { ProcessDataset } from '../../analyzer.js';

var AnalyzerName = "bertopic-1";
var Analyzer = new (await import(`./${AnalyzerName}.js`)).default;
var Models = ["gpt-3.5-turbo", "gpt-4.5-turbo", "llama3-70b", "claude3-haiku", "claude3-sonnet", "mixtral-8x22b"];
// Models = ["llama3-70b"];

await UseLLMs(async () => {
    await ProcessDataset(Analyzer, "Coded Dataset 1", false);
}, ...Models);

process.exit(0);