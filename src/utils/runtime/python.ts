/**
 * Python Runtime Integration
 *
 * This module provides utilities for executing Python scripts from Node.js, with automatic
 * Python interpreter detection and virtual environment support.
 *
 * Python Path Resolution Strategy:
 * 1. Check QAJob.Context for explicitly configured pythonPath
 * 2. Fall back to .venv/bin/python (Unix/Mac) or .venv/Scripts/python (Windows)
 * 3. If no venv found, let python-shell use system Python
 *
 * Data Exchange Pattern:
 * - Node → Python: Write binary data to known/temp.bytes, metadata to known/*.temp.json
 * - Python → Node: Python prints JSON to stdout, Node parses with custom parser
 * - Synchronization: AsyncLock (in embeddings.ts) prevents concurrent temp file access
 *
 * Use Cases:
 * - Clustering: Pass embeddings to Python sklearn/HDBSCAN for analysis
 * - Evaluation: Complex statistical analysis better suited for Python's ecosystem
 * - Future: Any computation where Python libraries are more mature than JS equivalents
 *
 * @example
 * await runPythonScript("scripts/analyze.py", {
 *   args: ["dimension", "count"],
 *   parser: (line) => {
 *     if (line.startsWith("{")) {
 *       const result = JSON.parse(line);
 *       // Process result
 *     }
 *   }
 * });
 */

import { existsSync } from "fs";
import { resolve } from "path";

import { AsyncScope } from "@rakuzen25/async-store";
import type { Options } from "python-shell";
import { PythonShell } from "python-shell";

import { QAJob } from "../../job.js";

import { logger } from "../core/logger.js";

/**
 * Resolve the Python interpreter path
 *
 * Resolution order:
 * 1. QAJob.Context.pythonPath (if in context and exists)
 * 2. .venv/bin/python (Unix/Mac)
 * 3. .venv/Scripts/python (Windows)
 * 4. undefined (falls back to system Python)
 *
 * @returns Absolute path to Python interpreter, or undefined for system default
 * @internal
 */
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

/**
 * Execute a Python script with automatic interpreter detection
 *
 * Runs a Python script using PythonShell with the appropriate interpreter.
 * The interpreter is automatically detected using getPythonPath().
 *
 * @param path - Path to the Python script file
 * @param args - Optional python-shell Options (args, parser, mode, etc.)
 * @returns Promise that resolves when script completes
 *
 * @example
 * await runPythonScript("clustering.py", {
 *   args: ["512", "100"],
 *   parser: (msg) => console.log(msg)
 * });
 */
export const runPythonScript = (path: string, args?: Options) =>
    PythonShell.run(path, {
        ...args,
        pythonPath: getPythonPath(),
    });
