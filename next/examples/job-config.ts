import { QAJob, type QAJobConfig } from "../job";
import { LoadStep } from "../steps/load-step";
import { logger } from "../utils/logger";

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
