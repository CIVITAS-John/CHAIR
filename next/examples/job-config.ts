import LowLevelAnalyzer4 from "../coding/low-level-4";
import LowLevelAnalyzer5 from "../coding/low-level-5";
import { QAJob, type QAJobConfig } from "../job";
import { CodeStep } from "../steps/code-step";
import { ConsolidateStep } from "../steps/consolidate-step";
import { EvaluateStep } from "../steps/evaluate-step";
import { LoadStep } from "../steps/load-step";
import { logger } from "../utils/logger";

const load = new LoadStep({
    path: "./next/examples/data",
});

const code = new CodeStep({
    agent: "AI",
    strategy: [LowLevelAnalyzer4, LowLevelAnalyzer5],
    model: ["gpt-3.5-turbo", "gpt-4.5-turbo", "o3-mini"],
});

// const code2 = new CodeStep({
//     agent: "Human",
//     coders: ["john", "jane"],
// });

const consolidate = new ConsolidateStep({
    model: ["gpt-3.5-turbo", "gpt-4.5-turbo", "o3-mini"],
});

const evaluate = new EvaluateStep({
    consolidator: consolidate,
    subdir: "evaluation",
});

const config: QAJobConfig = {
    embedder: "openai-small-512",
    steps: [load, code, consolidate, evaluate],
    parallel: true,
};

try {
    const job = new QAJob(config);
    await job.execute();
} catch (error) {
    logger.error(error, true);
    process.exit(1);
}
