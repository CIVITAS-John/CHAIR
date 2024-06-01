import * as File from 'fs';
import { UseLLMs } from '../../translation/general.js';
import { LowLevelAnalyzer2 } from './low-level-2.js';
import { ProcessDataset } from '../analyzer.js';

await UseLLMs(async () => {
    await ProcessDataset(new LowLevelAnalyzer2(), "Coded Dataset 2", false);
    await ProcessDataset(new LowLevelAnalyzer2(), "Coded Dataset 1", false);
}, "gpt-3.5-turbo", "mixtral-8x22b", "gpt-4.5-omni", "llama3-70b", "claude3-haiku", "claude3-sonnet");

process.exit(0);