import * as File from 'fs';
import { UseLLMs } from '../../utils/llms.js';
import { LowLevelAnalyzer3 } from './low-level-3.js';
import { ProcessDataset } from '../analyzer.js';

await UseLLMs(async () => {
    await ProcessDataset(new LowLevelAnalyzer3(), "Coded Dataset 1", false);
    // await ProcessDataset(new LowLevelAnalyzer1(), "Coded Dataset 2", false);
}, "gpt-3.5-turbo", "mixtral-8x22b", "gpt-4.5-omni", "llama3-70b", "claude3-haiku", "claude3-sonnet");
// }, "llama3-70b");

process.exit(0);