import { QAJob } from "./job";
import { logger } from "./logger";
import { readJSONFile } from "./utils";

const args = process.argv.slice(2);

if (args.length !== 1) {
    console.error("Usage: node index.js <path-to-config-file>");
    process.exit(1);
}

try {
    const job = new QAJob(readJSONFile(args[0]));
    await job.execute();
} catch (error) {
    logger.error("An error occurred", error, true);
    process.exit(1);
}
