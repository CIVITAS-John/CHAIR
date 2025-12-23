/**
 * File System Utilities
 *
 * This module provides helpers for file operations including:
 * - JSON file I/O
 * - Dynamic ES module imports
 * - Recursive directory traversal
 * - Path manipulation (common prefix/suffix removal)
 * - Directory creation with recursive support
 */

import { mkdirSync, readdirSync, readFileSync, statSync } from "fs";
import { join, resolve } from "path";

import commonPathPrefix from "common-path-prefix";

import { reverse } from "../core/misc.js";

/**
 * Read and parse a JSON file
 *
 * @template T - Expected type of the JSON data
 * @param path - Path to the JSON file
 * @returns Parsed JSON data typed as T
 * @throws {SyntaxError} If file contains invalid JSON
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export const readJSONFile = <T>(path: string) => JSON.parse(readFileSync(path, "utf-8")) as T;

/**
 * Dynamically import an ES module and extract its default export
 *
 * Uses file:// protocol for proper ESM loading with absolute paths.
 *
 * @param path - Path to the module file (will be resolved to absolute)
 * @returns The default export of the module
 * @throws {TypeError} If module has no default export
 */
export const importDefault = async (path: string) => {
    const module = (await import(`file://${resolve(path)}`)) as unknown;
    if (typeof module !== "object" || module === null) {
        throw new TypeError(`${path} is not a valid module`);
    }
    if (!("default" in module)) {
        throw new TypeError(`Module ${path} does not have a default export`);
    }
    return module.default;
};

/**
 * Ensure a directory exists, creating it and parents if necessary
 *
 * @param path - Directory path to create
 * @returns The same path (for chaining)
 */
export const ensureFolder = (path: string) => {
    mkdirSync(path, { recursive: true });
    return path;
};

/**
 * Recursively get all files in a directory tree
 *
 * @param source - Directory path or file path
 * @returns Array of absolute file paths
 */
export const getFilesRecursively = (source: string) => {
    // Check if the source is a file
    if (statSync(source).isFile()) {
        return [source];
    }
    // Read all directory contents (files and directories)
    let files: string[] = [];
    const entries = readdirSync(source, { withFileTypes: true });
    // Iterate through each entry
    for (const entry of entries) {
        // Full path of the current entry
        const fullPath = join(source, entry.name);
        if (entry.isDirectory()) {
            // If entry is a directory, recursively get files from it
            files = files.concat(getFilesRecursively(fullPath));
        } else {
            // If entry is a file, add it to the files array
            files.push(fullPath);
        }
    }
    return files;
};

/** Remove common prefixes and suffixes from a list of names. */
export const removePrefixSuffix = (names: string[]) => {
    // Find common prefixes and remove them
    let prefix = commonPathPrefix(names, names[0].includes("\\") ? "\\" : "/");
    names = names.map((name) => name.substring(prefix.length));
    prefix = commonPathPrefix(names, "-");
    names = names.map((name) => name.substring(prefix.length));
    // Find common suffixes and remove them
    const suffix = reverse(
        commonPathPrefix(
            names.map((name) => reverse(name)),
            "-",
        ),
    );
    names = names.map((name) => {
        const newName = name.substring(0, name.length - suffix.length);
        return newName === "" ? "root" : newName;
    });
    return names;
};
