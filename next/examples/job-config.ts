import { QAJob, type QAJobConfig } from "../job";
import { logger } from "../logger";
import { LoadStep } from "../steps/load-step";

const load = new LoadStep({
    path: "./next/examples/data",
});

const config: QAJobConfig = {
    embeddingModel: "",
    steps: [load],
    parallel: true,
};

try {
    const job = new QAJob(config);
    await job.execute();
} catch (error) {
    logger.error(error, true);
    process.exit(1);
}
