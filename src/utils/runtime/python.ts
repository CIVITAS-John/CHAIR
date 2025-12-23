import { existsSync } from "fs";
import { resolve } from "path";

import { AsyncScope } from "@rakuzen25/async-store";
import type { Options } from "python-shell";
import { PythonShell } from "python-shell";

import { QAJob } from "../../job.js";

import { logger } from "../core/logger.js";

const getPythonPath = () => {
    // Determine from BaseStep.Context first
    let pythonPath: string | undefined;
    try {
        pythonPath = QAJob.Context.get().pythonPath;
    } catch (e) {
        if (!(e instanceof AsyncScope.NotFoundError)) {
            throw e;
        }
        logger.warn("Python path not found in job context, falling back to .venv");
    }
    if (pythonPath && existsSync(pythonPath)) {
        return pythonPath;
    }

    const venvPath = resolve(process.cwd(), ".venv");
    if (!existsSync(venvPath)) {
        return;
    }
    pythonPath = resolve(venvPath, "bin", "python");
    if (!existsSync(pythonPath)) {
        pythonPath = resolve(venvPath, "Scripts", "python");
    }
    if (!existsSync(pythonPath)) {
        return;
    }
    return pythonPath;
};

export const runPythonScript = (path: string, args?: Options) =>
    PythonShell.run(path, {
        ...args,
        pythonPath: getPythonPath(),
    });
