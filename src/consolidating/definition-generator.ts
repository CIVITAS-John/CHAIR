import type { Code, Codebook } from "../schema.js";
import { BaseStep } from "../steps/base-step.js";
import { logger } from "../utils/core/logger.js";

import { updateCodes } from "./codebooks.js";
import { CodeConsolidator } from "./consolidator.js";

/** DefinitionParse: Parse generated definitions based on labels and quotes. */
export abstract class DefinitionParser extends CodeConsolidator {
    override chunkified = true;

    /** Parse the response for the code consolidator. */
    override parseResponse(codebook: Codebook, codes: Code[], lines: string[]) {
        const pendings: Code[] = [];
        let curCode: Code | undefined;
        let status = "";
        // Parse the definitions
        for (let line of lines) {
            if (line === "" || line.startsWith("---")) {
                continue;
            }
            // Sometimes, LLMs will do **(...)** for anything. We need to remove that.
            line = line.replace(/\*\*/g, "");
            // If we see "...", that means later codes are not processed and should be truncated
            if (line === "...") {
                break;
            }
            const match = /^\d+\./.exec(line);
            if (match) {
                line = line.substring(match[0].length).trim();
                // Sometimes, the label is merged with the number
                curCode = {
                    label: line.trim().toLowerCase(),
                    definitions: [],
                    categories: [],
                    examples: [],
                    alternatives: [],
                };
                pendings.push(curCode);
                status = "";
            }
            if (line.startsWith("Label:") && curCode) {
                curCode.label = line.substring(6).trim().toLowerCase();
                status = "Label";
            } else if (line.startsWith("Phrase:") && curCode) {
                curCode.label = line.substring(7).trim().toLowerCase();
                status = "Label";
            } else if (line.startsWith("Criteria:") && curCode) {
                const definition = line.substring(9).trim();
                if (definition !== "") {
                    curCode.definitions = [definition];
                }
                status = "Criteria";
            } else if (line.startsWith("Category:") && curCode) {
                const Category = line.substring(9).trim();
                if (Category !== "") {
                    curCode.categories = [Category.toLowerCase()];
                }
                status = "Category";
            } else if (status === "Label" && curCode) {
                curCode.label = `${curCode.label}\n${line}`.trim();
            } else if (status === "Criteria" && curCode) {
                curCode.definitions?.push(line.trim());
            } else if (status === "Theme" && curCode) {
                // Sometimes, the theme ends with a "."
                if (line.endsWith(".")) {
                    line = line.substring(0, line.length - 1).trim();
                }
                curCode.categories?.push(line.trim());
            }
        }
        // Check if we have all the codes and avoid mismatches
        for (let i = 0; i < pendings.length; i++) {
            const newCode = pendings[i];
            // Sometimes, the new label starts with "label:"
            if (newCode.label.startsWith("label:")) {
                newCode.label = newCode.label.substring(6).trim();
            }
            // Sometimes, the new label starts with "phrase:"
            if (newCode.label.startsWith("phrase:")) {
                newCode.label = newCode.label.substring(7).trim();
            }
            // Sometimes, the new label is wrapped in ""
            if (newCode.label.startsWith('"') && newCode.label.endsWith('"')) {
                newCode.label = newCode.label.substring(1, newCode.label.length - 1);
            }
            // Sometimes, the new label ends with "."
            if (newCode.label.endsWith(".")) {
                newCode.label = newCode.label.substring(0, newCode.label.length - 1).trim();
            }
            // Sometimes, the order of labels is wrong (! found for gpt-3.5-turbo)
            const Found = codes.findIndex((Code) => Code.label === newCode.label);
            if (Found !== -1 && Found !== i) {
                throw new CodeConsolidator.InvalidResponseError(
                    `Invalid response: code ${newCode.label}'s mapping order is wrong (was at ${Found}, now at ${i}).`,
                );
            }
        }
        // Update the codes
        updateCodes(codebook, pendings, codes);
        // Remove temp labels
        codes.forEach((Code) => delete Code.oldLabels);
        // Return the cursor movement
        return Promise.resolve(Object.keys(pendings).length - codes.length);
    }
}

/** DefinitionGenerator: Generate definitions based on labels and quotes. */
export class DefinitionGenerator extends DefinitionParser {
    protected override get _prefix() {
        return logger.prefixed(logger.prefix, "DefinitionGenerator");
    }
    /** Parse the response for the code consolidator. */
    override async parseResponse(codebook: Codebook, codes: Code[], lines: string[]) {
        // Filter has to happen here, otherwise some codes will get omitted
        const oldcodes = codes.filter((Code) => (Code.definitions?.length ?? 0) === 0);
        const result = await super.parseResponse(codebook, oldcodes, lines);
        logger.debug(
            `Generated ${oldcodes.filter((Code) => (Code.definitions?.length ?? 0) > 0).length} definitions for ${oldcodes.length} codes (${codes.length} in total), cursor movement ${result}.`,
        );
        return result;
    }

    /** Postprocess the subunits after everything is done. */
    override postprocess(subunits: Code[]): Promise<Code[]> {
        const mergedCodes = subunits.filter((Code) => (Code.oldLabels?.length ?? 0) > 0);
        const mergedCount = mergedCodes.reduce(
            (acc, Code) => acc + (Code.oldLabels?.length ?? 0),
            0,
        );
        logger.success(
            `Generated ${subunits.filter((Code) => (Code.definitions?.length ?? 0) > 0).length} definitions for ${subunits.length} codes, with ${subunits.filter((Code) => Code.label === "[Merged]").length} implicitly merged. Sanity check: ${mergedCodes.length} codes merged ${mergedCount}.`,
        );
        return super.postprocess(subunits);
    }

    /** Build the prompts for the code consolidator. */
    override buildPrompts(_codebook: Codebook, codes: Code[]): Promise<[string, string]> {
        const { dataset } = BaseStep.Context.get();
        codes = codes.filter((Code) => (Code.definitions?.length ?? 0) === 0);
        // Generate definitions for codes
        return Promise.resolve([
            `
You are an expert in thematic analysis clarifying the criteria of qualitative codes. 
Each code is independent of others. Do not attempt to merge codes (i.e. using one code's label for another code)
Write clear and generalizable criteria for each code and do not introduce unnecessary details.
Try to understand and follow the coder's intention by considering provided quotes. Each quote is independent of others. 
If necessary for accuracy and clarity, refine labels, but follow the corresponding input label's intent and style.
${dataset.researchQuestion}
Always follow the output format:
---
Definitions for each code (${codes.length} in total):
1. 
Criteria: {Who did what, and how for code 1}
Label: {The original or refined label of code 1}
...
${codes.length}.
Criteria: {Who did what, and how for code ${codes.length}}
Label: {The original or refined label of code ${codes.length}}
---`.trim(),
            codes
                .map((code, idx) =>
                    `
${idx + 1}.
Label: ${code.label}
Quotes:
${takeExamples(code.examples ?? [], 5)
    .map((example) => `- ${example}`)
    .join("\n")}`.trim(),
                )
                .join("\n\n"),
        ]);
    }
}

/**
 * Take some best unique examples from a set.
 * Here, best is defined as the longest * most frequent unique quotes.
 */
const takeExamples = (examples: string[], take = 1000000) => {
    const exampleMap = new Map<string, number>();
    for (let example of examples) {
        const Index = example.indexOf("|||");
        if (Index !== -1) {
            example = example.substring(Index + 3);
        }
        exampleMap.set(example, exampleMap.get(example) ?? 0 + 1);
    }
    for (const [example, count] of exampleMap) {
        exampleMap.set(example, count * example.length);
    }
    return Array.from(exampleMap.keys())
        .sort((A, B) => (exampleMap.get(B) ?? 0) - (exampleMap.get(A) ?? 0))
        .slice(0, take);
};
