import { existsSync } from "fs";
import { join } from "path";

import type { Codebook, CodedThreads, DataChunk, DataItem, Dataset } from "../../schema.js";
import { logger } from "../core/logger.js";

import { readJSONFile } from "./file.js";

export type CodebookHarmonizer = (analyses: CodedThreads, source: string) => CodedThreads;

/**
 * Create a harmonizer that maps imported human codes to current codebook labels.
 *
 * The authoritative codebook may keep stable keys while changing `code.label`.
 * Human exports can therefore contain either old keys or already-current labels.
 * This normalizes both forms to current labels for runtime analysis only.
 */
export const createCodebookHarmonizer = <TUnit extends DataChunk<DataItem>>(
    dataset: Dataset<TUnit>,
): CodebookHarmonizer | undefined => {
    const codebookPath = join(dataset.path, "codebook.json");
    if (!existsSync(codebookPath)) {
        return undefined;
    }

    const authoritative = readJSONFile<Codebook>(codebookPath);
    const labelKeyedCodebook: Codebook = {};
    const codeToLabel = new Map<string, string>();

    for (const [key, code] of Object.entries(authoritative)) {
        const label = code.label;
        labelKeyedCodebook[label] = { ...code, label };
        codeToLabel.set(key, label);
        codeToLabel.set(label, label);
    }

    return (analyses, source) => {
        let retainedCount = 0;
        let renamedCount = 0;
        let removedCount = 0;
        let deduplicatedCount = 0;
        const removedCodes = new Set<string>();

        for (const thread of Object.values(analyses.threads)) {
            thread.codes = labelKeyedCodebook;

            for (const item of Object.values(thread.items)) {
                if (!item.codes) continue;

                const mappedCodes: string[] = [];
                const seen = new Set<string>();

                for (const code of item.codes) {
                    const label = codeToLabel.get(code);
                    if (!label) {
                        removedCount++;
                        removedCodes.add(code);
                        continue;
                    }

                    if (seen.has(label)) {
                        deduplicatedCount++;
                        continue;
                    }

                    seen.add(label);
                    mappedCodes.push(label);

                    if (label === code) {
                        retainedCount++;
                    } else {
                        renamedCount++;
                    }
                }

                item.codes = mappedCodes;
            }
        }

        analyses.codebook = labelKeyedCodebook;

        logger.info(
            `Harmonized human codes from ${source}: ${retainedCount} retained, ` +
                `${renamedCount} renamed, ${removedCount} removed, ${deduplicatedCount} deduplicated`,
        );

        if (removedCodes.size > 0) {
            logger.warn(
                `Removed unknown human codes from ${source}: ${[...removedCodes].sort().join("; ")}`,
            );
        }

        return analyses;
    };
};
