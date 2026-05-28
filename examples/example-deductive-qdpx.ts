import ItemLevelCoderSimple from "../src/coding/deductive/item-level-simple.js";
import { QAJob, type QAJobConfig } from "../src/job.js";
import { LoadQdpxStep } from "../src/loading/load-qdpx-step.js";
import { CodeStep } from "../src/steps/code-step.js";
import { EnsembleCodeStep } from "../src/steps/ensemble-code-step.js";
import { ConsolidateStep } from "../src/steps/consolidate-step.js";
import { ReliabilityStep } from "../src/steps/reliability-step.js";
import { logger } from "../src/utils/core/logger.js";

const qdpxOutputDir = "./examples/qdpx-data/example-json";
const qdpxCodebook = `${qdpxOutputDir}/codebook.json`;

const load = new LoadQdpxStep({
    path: "./examples/qdpx-data/example.qdpx",
    outputDir: qdpxOutputDir,
});

// Two deductive coders at different temperatures for ensemble voting
const codeDeductive1 = new CodeStep({
    agent: "AI",
    strategy: ItemLevelCoderSimple,
    model: ["gpt-5.4-mini"],
    codebook: qdpxCodebook,
    parameters: {
        temperature: 0.3,
        alias: "0",
    },
});

const codeDeductive2 = new CodeStep({
    agent: "AI",
    strategy: ItemLevelCoderSimple,
    model: ["gpt-5.4-mini"],
    codebook: qdpxCodebook,
    parameters: {
        temperature: 0.5,
        alias: "1",
    },
});

// Ensemble: keep codes where both coders agree
const ensemble = new EnsembleCodeStep({
    coders: [codeDeductive1, codeDeductive2],
    voteThreshold: 0.5,
});

// Consolidate: collect codebooks for comparison (no merging in deductive mode)
const consolidate = new ConsolidateStep({
    namePattern: "codebook",
    coder: [codeDeductive1, codeDeductive2, ensemble],
    builderConfig: {
        consolidators: [],
    },
});

// Reliability: compute inter-coder agreement
const reliability = new ReliabilityStep({
    consolidator: consolidate,
});

const config: QAJobConfig = {
    steps: [load, codeDeductive1, codeDeductive2, ensemble, consolidate, reliability],
    parallel: true,
};

try {
    const job = new QAJob(config);
    await job.execute();
} catch (error) {
    logger.error(error, true);
    process.exit(1);
}
