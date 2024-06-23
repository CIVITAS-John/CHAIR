import { UseLLMs } from '../../utils/llms.js';
import { ProcessDataset } from '../../analyzer.js';

var AnalyzerName = "low-level-4";
var Analyzer = await import(`./${AnalyzerName}.js`);

await UseLLMs(async () => {
    await ProcessDataset(Analyzer, "Coded Dataset 1", false);
}, "gpt-3.5-turbo", "gpt-4.5-turbo", "llama3-70b", "claude3-haiku", "claude3-sonnet", "mixtral-8x22b");

process.exit(0);