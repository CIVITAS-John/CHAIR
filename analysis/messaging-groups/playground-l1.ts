import * as File from 'fs';
import { UseLLMs } from '../../translation/general.js';
import { LowLevelAnalyzer1 } from './low-level-1.js';
import { ProcessDataset } from '../analyzer.js';

await UseLLMs(async () => {
    await ProcessDataset(new LowLevelAnalyzer1(), "Coded Dataset 2", false);
    await ProcessDataset(new LowLevelAnalyzer1(), "Coded Dataset 1", false);
}, "gpt-3.5-turbo", "mixtral-8x22b", "gpt-4.5-omni", "llama3-70b", "claude3-haiku", "claude3-sonnet");

process.exit(0);