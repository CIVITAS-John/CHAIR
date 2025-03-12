import { writeFileSync } from "fs";

import chalk from "chalk";

export enum LogLevel {
    ERROR,
    WARN,
    INFO,
    DEBUG,
}

const logPath = `logs/${new Date().toISOString().replace(/:/g, "-")}.log`;
const format = (message: string, level: LogLevel, name = "") =>
    `${level ? `[${level}] ` : ""}${name ? `${name}: ` : ""}${message}`;

const logFile = (message: string, file?: string) => {
    if (file) {
        writeFileSync(file, `${new Date().toISOString()} ${message}\n`, { flag: "a" });
    }
};

class Logger {
    private readonly file: string;
    private readonly verbosity: LogLevel;
    constructor(file?: string, verbosity?: LogLevel) {
        this.file = file ?? logPath;
        this.verbosity = verbosity ?? LogLevel.INFO;
    }

    error(error?: unknown, recoverable = false, name?: string) {
        const message =
            error instanceof Error
                ? error.message
                : typeof error === "string"
                  ? error
                  : JSON.stringify(error);
        const formatted = format(message, LogLevel.ERROR, name);
        const tb = error instanceof Error ? error.stack : undefined;

        console.error(chalk.red(formatted));
        if (tb) {
            console.error(chalk.red(tb));
        }
        logFile(formatted, this.file);
        if (tb) {
            logFile(tb, this.file);
        }

        if (!recoverable) {
            // Throw the error
            if (error instanceof Error) {
                throw error;
            }
            throw new Error(message);
        }
    }

    warn(message: string, name?: string) {
        const formatted = format(message, LogLevel.WARN, name);
        if (this.verbosity >= LogLevel.WARN) {
            console.warn(chalk.yellow(formatted));
        }
        logFile(formatted, this.file);
    }

    info(message: string, name?: string) {
        const formatted = format(message, LogLevel.INFO, name);
        if (this.verbosity >= LogLevel.INFO) {
            console.info(chalk.blue(formatted));
        }
        logFile(formatted, this.file);
    }

    debug(message: string, name?: string) {
        const formatted = format(message, LogLevel.DEBUG, name);
        if (this.verbosity >= LogLevel.DEBUG) {
            console.debug(chalk.gray(formatted));
        }
        logFile(formatted, this.file);
    }
}

export const logger = new Logger();
