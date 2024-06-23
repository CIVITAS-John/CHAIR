import { UseLLMs } from '../../utils/llms.js';
import { HighLevelAnalyzer1 } from './high-level-1.js';
import { ProcessDataset } from '../analyzer.js';

await UseLLMs(async () => {
    // await ProcessDataset(new HighLevelAnalyzer1(), "Coded Dataset 2", false);
    await ProcessDataset(new HighLevelAnalyzer1(), "Coded Dataset 1", false);
}, "gpt-3.5-turbo", "gpt-4.5-turbo", "llama3-70b", "claude3-haiku", "claude3-sonnet", "mixtral-8x22b");

process.exit(0);