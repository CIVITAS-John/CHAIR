import type { QAJobConfig } from "./job";
import { QAJob } from "./job";
import { logger } from "./logger";
import { importDefault } from "./utils";

const args = process.argv.slice(2);

if (args.length !== 1) {
    console.error("Usage: node index.js <path-to-config-file>");
    process.exit(1);
}

try {
    const config = await importDefault(args[0]);
    if (typeof config !== "object" || config === null) {
        throw new TypeError(`${args[0]} does not export a valid object`);
    }
    if (!("steps" in config) || !Array.isArray(config.steps) || !config.steps.length) {
        throw new TypeError(`${args[0]} does not have a valid steps array`);
    }
    const job = new QAJob(config as QAJobConfig);
    await job.execute();
} catch (error) {
    logger.error(error, true);
    process.exit(1);
}
