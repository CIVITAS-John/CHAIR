import LowLevelAnalyzerAny from "../coding/low-level-any";
import LowLevelAnalyzerVerb from "../coding/low-level-verb";
import { QAJob, type QAJobConfig } from "../job";
import { CodeStep } from "../steps/code-step";
import { ConsolidateStep } from "../steps/consolidate-step";
import { EvaluateStep } from "../steps/evaluate-step";
import { LoadStep } from "../steps/load-step";
import { logger } from "../utils/logger";

const load = new LoadStep({
    path: "./examples/data",
});

const code = new CodeStep({
    agent: "AI",
    strategy: [LowLevelAnalyzerAny, LowLevelAnalyzerVerb],
    model: ["gpt-4.5-omni"],
});

// const code2 = new CodeStep({
//     agent: "Human",
//     coders: ["john", "jane"],
// });

const consolidate = new ConsolidateStep({
    model: ["gpt-4.5-omni"],
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
