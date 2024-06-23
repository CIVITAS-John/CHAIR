import { UseLLMs } from '../../utils/llms.js';
import { HighLevelAnalyzer2 } from './high-level-2.js';
import { ProcessDataset } from '../../analyzer.js';

await UseLLMs(async () => {
    await ProcessDataset(new HighLevelAnalyzer2(), "Coded Dataset 1", false);
    // await ProcessDataset(new HighLevelAnalyzer2(), "Coded Dataset 2", false);
}, "gpt-3.5-turbo", "gpt-4.5-omni", "llama3-70b", "claude3-haiku", "claude3-sonnet", "mixtral-8x22b"); // "llama3-70b", "llama3-70b_1", "llama3-70b_2", "llama3-70b_3", "llama3-70b_4", "llama3-70b_5"

process.exit(0);