import { mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";

import chalk from "chalk";

export enum LogLevel {
    ERROR,
    WARN,
    INFO,
    DEBUG,
}

const logPath = `logs/${new Date().toISOString().replace(/:/g, "-")}.log`;
const format = (message: string, level: string, name = "") =>
    `${level ? `[${level}] ` : ""}${name ? `${name}: ` : ""}${message}`;

class Logger {
    private readonly file: string;
    private readonly verbosity: LogLevel;
    constructor(file?: string, verbosity?: LogLevel) {
        this.file = file ?? logPath;
        mkdirSync(dirname(this.file), { recursive: true });
        this.verbosity = verbosity ?? LogLevel.INFO;
    }

    private logFile(message: string) {
        writeFileSync(this.file, `${new Date().toISOString()} ${message}\n`, { flag: "a+" });
    }

    error(error?: unknown, recoverable = false, name?: string) {
        const message =
            error instanceof Error
                ? error.message
                : typeof error === "string"
                  ? error
                  : JSON.stringify(error);
        const formatted = format(message, "ERROR", name);
        const tb = error instanceof Error ? error.stack : undefined;

        console.error(chalk.red(formatted));
        if (tb) {
            console.error(chalk.red(tb));
        }
        this.logFile(formatted);
        if (tb) {
            this.logFile(tb);
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
        const formatted = format(message, "WARN", name);
        if (this.verbosity >= LogLevel.WARN) {
            console.warn(chalk.yellow(formatted));
        }
        this.logFile(formatted);
    }

    info(message: string, name?: string) {
        const formatted = format(message, "INFO", name);
        if (this.verbosity >= LogLevel.INFO) {
            console.info(chalk.blue(formatted));
        }
        this.logFile(formatted);
    }

    debug(message: string, name?: string) {
        const formatted = format(message, "DEBUG", name);
        if (this.verbosity >= LogLevel.DEBUG) {
            console.debug(chalk.gray(formatted));
        }
        this.logFile(formatted);
    }
}

export const logger = new Logger();
