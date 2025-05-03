import ItemLevelAnalyzerAny from "../src/coding/item-level-any.js";
import ItemLevelAnalyzerVerb from "../src/coding/item-level-verb.js";
import { QAJob, type QAJobConfig } from "../src/job.js";
import { CodeStep } from "../src/steps/code-step.js";
import { ConsolidateStep } from "../src/steps/consolidate-step.js";
import { EvaluateStep } from "../src/steps/evaluate-step.js";
import { LoadStep } from "../src/steps/load-step.js";
import { logger } from "../src/utils/logger.js";

const load = new LoadStep({
    path: "./examples/data",
});

const code = new CodeStep({
    agent: "AI",
    strategy: [ItemLevelAnalyzerAny, ItemLevelAnalyzerVerb],
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
