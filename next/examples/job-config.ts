import LowLevelAnalyzer5 from "../coding/low-level-5";
import { QAJob, type QAJobConfig } from "../job";
import { CodeStep } from "../steps/code-step";
import { LoadStep } from "../steps/load-step";
import { logger } from "../utils/logger";

const load = new LoadStep({
    path: "./next/examples/data",
});

const code = new CodeStep({
    agent: "AI",
    strategy: [LowLevelAnalyzer5],
    model: ["gpt-3.5-turbo", "gpt-4.5-turbo"],
});

const code2 = new CodeStep({
    agent: "Human",
    coders: ["john", "jane"],
});

const config: QAJobConfig = {
    embeddingModel: "",
    steps: [load, code, code2],
    parallel: true,
};

try {
    const job = new QAJob(config);
    await job.execute();
} catch (error) {
    logger.error(error, true);
    process.exit(1);
}
