import ItemLevelAnalyzerAny from "../src/coding/item-level-any.js";
import ItemLevelAnalyzerVerb from "../src/coding/item-level-verb.js";
import { DefinitionGenerator } from "../src/consolidating/definition-generator.js";
import { RefineMerger } from "../src/consolidating/refine-merger.js";
import { SimpleMerger } from "../src/consolidating/simple-merger.js";
import { QAJob, type QAJobConfig } from "../src/job.js";
import { CodeStep } from "../src/steps/code-step.js";
import { ConsolidateStep } from "../src/steps/consolidate-step.js";
import { EvaluateStep } from "../src/steps/evaluate-step.js";
import { LoadStep } from "../src/steps/load-step.js";
import { logger } from "../src/utils/logger.js";

const load = new LoadStep({
    path: "./examples/txt-data",
});

const code = new CodeStep({
    agent: "AI",
    strategy: [
        ItemLevelAnalyzerAny,
        ItemLevelAnalyzerVerb,
        new ItemLevelAnalyzerAny({
            name: "item-flooding",
            prompt: "Special requirement: always generate more than 20 phrases for each message.",
        }),
    ],
    model: ["gpt-4o"],
});

// const code2 = new CodeStep({
//     agent: "Human",
//     coders: ["john", "jane"],
// });

const consolidate = new ConsolidateStep({
    model: ["gpt-4o"],
    builderConfig: {
        consolidators: [
            new SimpleMerger({ looping: true }),
            new DefinitionGenerator(),
            new RefineMerger({
                maximum: 0.5,
                minimum: 0.4,
                looping: true,
            }),
            new RefineMerger({
                maximum: 0.6,
                minimum: 0.4,
                looping: true,
            }),
        ],
    },
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
