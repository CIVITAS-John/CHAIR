import { writeFileSync } from "fs";
import { dirname } from "path";

import chalk from "chalk";

import { ensureFolder } from "./misc";

export enum LogLevel {
    ERROR,
    WARN,
    SUCCESS,
    INFO,
    DEBUG,
}

const logPath = `logs/${new Date().toISOString().replace(/:/g, "-")}.log`;
const format = (message: string, level: string, source = "") =>
    `${level ? `[${level}] ` : ""}${source ? `${source}: ` : ""}${message}`;

class Logger {
    readonly #file: string;
    readonly #verbosity: LogLevel;

    constructor(file?: string, verbosity?: LogLevel) {
        this.#file = file ?? logPath;
        ensureFolder(dirname(this.#file));
        this.#verbosity = verbosity ?? LogLevel.INFO;
    }

    #logFile(message: string) {
        writeFileSync(this.#file, `${new Date().toISOString()} ${message}\n`, { flag: "a+" });
    }

    error(error?: unknown, recoverable = false, source?: string) {
        const message =
            error instanceof Error
                ? error.message
                : typeof error === "string"
                  ? error
                  : JSON.stringify(error);
        const formatted = format(message, "ERROR", source);
        const tb = error instanceof Error ? error.stack : undefined;
        const cause = error instanceof Error ? error.cause : undefined;

        console.error(chalk.red(formatted));
        this.#logFile(formatted);
        if (tb) {
            console.error(chalk.red(tb));
            this.#logFile(tb);
        }
        if (cause) {
            console.error(chalk.red("cause:"));
            this.#logFile("cause:");
            this.error(cause, recoverable, source);
        }

        if (!recoverable) {
            // Throw the error
            if (error instanceof Error) {
                throw error;
            }
            throw new Error(message);
        }
    }

    warn(message: string, source?: string) {
        const formatted = format(message, "WARN", source);
        if (this.#verbosity >= LogLevel.WARN) {
            console.warn(chalk.yellow(formatted));
        }
        this.#logFile(formatted);
    }

    success(message: string, source?: string) {
        const formatted = format(message, "SUCCESS", source);
        if (this.#verbosity >= LogLevel.SUCCESS) {
            console.log(chalk.green(formatted));
        }
        this.#logFile(formatted);
    }

    info(message: string, source?: string) {
        const formatted = format(message, "INFO", source);
        if (this.#verbosity >= LogLevel.INFO) {
            console.info(chalk.blue(formatted));
        }
        this.#logFile(formatted);
    }

    debug(message: string, source?: string) {
        const formatted = format(message, "DEBUG", source);
        if (this.#verbosity >= LogLevel.DEBUG) {
            console.debug(chalk.gray(formatted));
        }
        this.#logFile(formatted);
    }
}

export const logger = new Logger();
