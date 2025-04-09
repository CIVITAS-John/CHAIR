import type { WriteStream } from "fs";
import { createWriteStream } from "fs";
import { dirname } from "path";

import chalk from "chalk";

import { ensureFolder } from "./file";

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
    readonly #file: WriteStream;
    readonly #verbosity: LogLevel;

    #consoleLock = false;
    lock() {
        console.clear();
        this.#consoleLock = true;
    }
    unlock() {
        this.#consoleLock = false;
    }

    constructor(file?: string, verbosity?: LogLevel) {
        const path = file ?? logPath;
        ensureFolder(dirname(path));
        this.#file = createWriteStream(path, {
            flags: "a+",
            encoding: "utf-8",
        });
        this.#verbosity = verbosity ?? LogLevel.INFO;
    }

    #logFile(message: string) {
        this.#file.write(`${new Date().toISOString()} ${message}\n`);
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

        if (!this.#consoleLock) console.error(chalk.red(formatted));
        this.#logFile(formatted);
        if (tb) {
            if (!this.#consoleLock) console.error(chalk.red(tb));
            this.#logFile(tb);
        }
        if (cause) {
            if (!this.#consoleLock) console.error(chalk.red("cause:"));
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
        if (!this.#consoleLock && this.#verbosity >= LogLevel.WARN) {
            console.warn(chalk.yellow(formatted));
        }
        this.#logFile(formatted);
    }

    success(message: string, source?: string) {
        const formatted = format(message, "SUCCESS", source);
        if (!this.#consoleLock && this.#verbosity >= LogLevel.SUCCESS) {
            console.log(chalk.green(formatted));
        }
        this.#logFile(formatted);
    }

    info(message: string, source?: string) {
        const formatted = format(message, "INFO", source);
        if (!this.#consoleLock && this.#verbosity >= LogLevel.INFO) {
            console.info(chalk.blue(formatted));
        }
        this.#logFile(formatted);
    }

    debug(message: string, source?: string) {
        const formatted = format(message, "DEBUG", source);
        if (!this.#consoleLock && this.#verbosity >= LogLevel.DEBUG) {
            console.debug(chalk.gray(formatted));
        }
        this.#logFile(formatted);
    }
}

export const logger = new Logger();
