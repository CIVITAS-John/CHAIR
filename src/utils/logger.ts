import type { WriteStream } from "fs";
import { createWriteStream } from "fs";
import { dirname } from "path";

import { AsyncScope, AsyncVar } from "@rakuzen25/async-store";
import chalk from "chalk";

import { ensureFolder } from "./file.js";
import { Stack } from "./stack.js";

export enum LogLevel {
    ERROR,
    WARN,
    SUCCESS,
    INFO,
    DEBUG,
}

const LoggerSource = new AsyncVar<Stack<string>>("LoggerSource");
const LoggerPrefix = new AsyncVar<Stack<string>>("LoggerPrefix");

abstract class LoggerError extends Error {
    override name = "Logger.Error";
    constructor(message: string, source?: string) {
        super(`${source ?? ""}${message}`);
    }
}

class Logger {
    static Error = LoggerError;
    static InternalError = class extends LoggerError {
        override name = "Logger.InternalError";
    };
    static ScopeError = class extends LoggerError {
        override name = "Logger.ScopeError";
    };
    static PrefixError = class extends LoggerError {
        override name = "Logger.PrefixError";
        constructor() {
            super("Prefix has not been set", LoggerSource.get().peek());
        }
    };

    readonly #file: WriteStream;
    readonly #verbosity: LogLevel;
    readonly format = (message: string, level: string, source?: string) =>
        `${level ? `[${level}] ` : ""}${source ? `${source}: ` : this.#source ? `${this.source}: ` : ""}${message}`;
    readonly prefixed = (prefix: string, mtd: string) => `${prefix}#${mtd}`;
    readonly filePath = `logs/${new Date().toISOString().replace(/:/g, "-")}.log`;

    constructor(file?: string, verbosity?: LogLevel) {
        this.filePath = file ?? this.filePath;
        ensureFolder(dirname(this.filePath));
        this.#file = createWriteStream(this.filePath, {
            flags: "a+",
            encoding: "utf-8",
        });
        this.#verbosity = verbosity ?? LogLevel.INFO;
    }

    #logFile(message: string) {
        this.#file.write(`${new Date().toISOString()} ${message}\n`);
    }

    #consoleLock = false;
    lock() {
        console.clear();
        this.#consoleLock = true;
    }
    unlock() {
        this.#consoleLock = false;
    }

    withSource<T>(source: string, func: () => Promise<T>): Promise<T>;
    withSource<T>(source: string, func: () => T): T;
    withSource<T>(prefix: string, method: string, func: () => T): T;
    withSource<T>(prefix: string, method: string, func: () => Promise<T>): Promise<T>;
    withSource<T>(prefix: string, method: string, withPrefix: true, func: () => T): T;
    withSource<T>(
        prefix: string,
        method: string,
        withPrefix: true,
        func: () => Promise<T>,
    ): Promise<T>;
    withSource<T>(
        sourceOrPrefix: string,
        funcOrMethod: (() => T | Promise<T>) | string,
        funcOrWithPrefix?: true | (() => T | Promise<T>),
        _func?: () => T | Promise<T>,
    ) {
        let prefix: string | undefined,
            method: string | undefined,
            source: string,
            withPrefix = false,
            func: () => T | Promise<T>;

        if (typeof funcOrMethod === "function") {
            // withSource(source, func)
            source = sourceOrPrefix;
            func = funcOrMethod;
        } else {
            // withSource(prefix, method, true?, func)
            prefix = sourceOrPrefix;
            method = funcOrMethod;
            source = this.prefixed(prefix, method);
            if (typeof funcOrWithPrefix === "function") {
                // withSource(prefix, method, func)
                func = funcOrWithPrefix;
            } else {
                // withSource(prefix, method, true, func)
                if (!_func) {
                    throw new Logger.InternalError("func is required", "Logger#withSource");
                }
                withPrefix = true;
                func = _func;
            }
        }
        try {
            if (!LoggerSource.exists()) {
                LoggerSource.set(new Stack<string>());
            }
            LoggerSource.get().push(source);

            const result = withPrefix && prefix ? this.withPrefix(prefix, func) : func();
            if (result instanceof Promise) {
                return result.finally(() => {
                    LoggerSource.get().pop();
                });
            }

            LoggerSource.get().pop();
            return result;
        } catch (e) {
            const err = new Logger.ScopeError(
                `Tried setting source to ${source} without a scope, am I wrapped in AsyncScope.run()?`,
            );
            err.cause = e;
            throw err;
        }
    }
    withDefaultSource<T>(method: string, func: () => T): T;
    withDefaultSource<T>(method: string, func: () => Promise<T>): Promise<T>;
    withDefaultSource<T>(method: string, func: () => T | Promise<T>) {
        return this.withSource(this.prefixed(this.prefix, method), func);
    }
    get #source() {
        try {
            return this.source;
        } catch (_) {}
    }
    get source() {
        try {
            return LoggerSource.get().peek();
        } catch (e) {
            const err =
                e instanceof AsyncScope.NotFoundError
                    ? new Logger.ScopeError(
                          "Tried getting source without a scope, am I wrapped in AsyncScope.run()?",
                      )
                    : new Logger.InternalError("An error occurred", "Logger#source");
            err.cause = e;
            throw err;
        }
    }

    withPrefix<T>(prefix: string, func: () => T): T;
    withPrefix<T>(prefix: string, func: () => Promise<T>): Promise<T>;
    withPrefix<T>(prefix: string, func: () => T | Promise<T>) {
        try {
            if (!LoggerPrefix.exists()) {
                LoggerPrefix.set(new Stack<string>());
            }
            LoggerPrefix.get().push(prefix);

            const result = func();
            if (result instanceof Promise) {
                return result.finally(() => {
                    LoggerPrefix.get().pop();
                });
            }

            LoggerPrefix.get().pop();
            return result;
        } catch (e) {
            const err =
                e instanceof AsyncScope.NotFoundError
                    ? new Logger.ScopeError(
                          `Tried setting prefix to ${prefix} without a scope, am I wrapped in AsyncScope.run()?`,
                      )
                    : new Logger.InternalError("An error occurred", "Logger#withPrefix");
            err.cause = e;
            throw err;
        }
    }
    get prefix() {
        let prefix: string | undefined;
        try {
            prefix = LoggerPrefix.get().peek();
        } catch (e) {
            const err =
                e instanceof AsyncScope.NotFoundError
                    ? new Logger.ScopeError(
                          "Tried to prefix without a scope, am I wrapped in AsyncScope.run()?",
                      )
                    : new Logger.InternalError("An error occurred", "Logger#prefix");
            err.cause = e;
            throw err;
        }

        if (!prefix) {
            throw new Logger.PrefixError();
        }
        return prefix;
    }

    error(error?: unknown, recoverable = false, source?: string) {
        const message =
            error instanceof Error
                ? error.message
                : typeof error === "string"
                  ? error
                  : JSON.stringify(error);
        const formatted = this.format(message, "ERROR", source);
        const tb = error instanceof Error ? error.stack : undefined;
        const cause = error instanceof Error ? error.cause : undefined;

        if (!this.#consoleLock) console.error(chalk.red(formatted));
        this.#logFile(formatted);
        if (tb) {
            if (!this.#consoleLock) console.error(chalk.red(tb));
            this.#logFile(tb);
        }
        if (cause) {
            if (!this.#consoleLock) console.error(chalk.red("Cause by:"));
            this.#logFile("Caused by:");
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
        const formatted = this.format(message, "WARN", source);
        if (!this.#consoleLock && this.#verbosity >= LogLevel.WARN) {
            console.warn(chalk.yellow(formatted));
        }
        this.#logFile(formatted);
    }

    success(message: string, source?: string) {
        const formatted = this.format(message, "SUCCESS", source);
        if (!this.#consoleLock && this.#verbosity >= LogLevel.SUCCESS) {
            console.log(chalk.green(formatted));
        }
        this.#logFile(formatted);
    }

    info(message: string, source?: string) {
        const formatted = this.format(message, "INFO", source);
        if (!this.#consoleLock && this.#verbosity >= LogLevel.INFO) {
            console.info(chalk.blue(formatted));
        }
        this.#logFile(formatted);
    }

    debug(message: string, source?: string) {
        const formatted = this.format(message, "DEBUG", source);
        if (!this.#consoleLock && this.#verbosity >= LogLevel.DEBUG) {
            console.debug(chalk.gray(formatted));
        }
        this.#logFile(formatted);
    }
}

export const logger = new Logger();
