import { join } from "path";

import md5 from "md5";

import { mergeCodebooks } from "../consolidating/codebooks.js";
import type {
    Code,
    Codebook,
    CodebookComparison,
    CodebookEvaluation,
    DataChunk,
    DataItem,
    Dataset,
} from "../schema.js";
import { withCache } from "../utils/cache.js";
import { evaluateTexts } from "../utils/embeddings.js";
import { logger } from "../utils/logger.js";
import { createOfflineBundle, launchServer } from "../utils/server.js";

import { CodebookEvaluator } from "./codebooks.js";

/** Get the strings of the codes. */
const getCodeString = (code: Code) => {
    let text = `${code.label}`;
    if ((code.definitions?.length ?? 0) > 0) {
        text += `Label: ${code.label}\nDefinition: ${(code.definitions ?? [])[0]}`;
    }
    return text;
};

/** NetworkEvaluator: A network evaluator of codebook against a reference codebook (#0) with potential human inputs. */
export class NetworkEvaluator<
    TUnit extends DataChunk<TSubunit>,
    TSubunit extends DataItem = DataItem,
> extends CodebookEvaluator {
    protected get _prefix() {
        return logger.prefixed(logger.prefix, "NetworkEvaluator");
    }

    /** The name of the evaluator. */
    override name = "network-evaluator";
    /** Whether we visualize the evaluation. */
    visualize = false;
    /** The dataset underlying the codebooks. */
    dataset: Dataset<TUnit>;
    /** Whether the dataset should be anonymized. */
    anonymize: boolean;
    /** The title of the evaluator. */
    title: string;
    /** The extra parameters for the evaluation. */
    parameters: Record<string, any> = {};

    /** Initialize the evaluator. */
    constructor({
        dataset,
        anonymize,
        title,
        parameters
    }: {
        dataset: Dataset<TUnit>;
        anonymize?: boolean;
        title?: string;
        parameters?: Record<string, any>;
    }) {
        super();
        this.dataset = dataset;
        this.anonymize = anonymize ?? true;
        this.title = title ?? "Network Evaluator";
        this.parameters = parameters ?? {};
    }

    /** Evaluate a number of codebooks. */
    override evaluate(
        reference: Codebook,
        codebooks: Record<string, Codebook>,
        groups: Record<string, [Codebook, string[]]>,
        exportPath = "./known",
    ): Promise<Record<string, CodebookEvaluation>> {
        return logger.withSource(this._prefix, "evaluate", true, async () => {
            const hash = md5(JSON.stringify(codebooks));
            const allCodebooks = [reference];
            const names: string[] = ["baseline"];
            const groupIndexes: number[][] = [[]];
            // Collect the names of the codebooks and groups
            for (const [name, codebook] of Object.entries(codebooks)) {
                names.push(name);
                groupIndexes.push([]);
                allCodebooks.push(codebook);
            }
            for (const [name, group] of Object.entries(groups)) {
                names.push(`group: ${name}`);
                groupIndexes.push(group[1].map((c) => names.indexOf(c)));
                allCodebooks.push(group[0]);
            }
            // Parse the codebooks and groups
            const weights = names.map((name, idx) => {
                if (idx === 0 || name.startsWith("group: ")) {
                    return 0;
                }
                const fields = name.split("~");
                const value = parseFloat(fields[fields.length - 1]);
                if (isNaN(value)) {
                    return 1;
                }
                names[idx] = fields.slice(0, fields.length - 1).join("~");
                return value;
            });
            // Build the network information
            await withCache(join(exportPath, "network"), hash, async () => {
                // We treat the first input as the reference codebook
                const merged = mergeCodebooks(allCodebooks, true);
                // Then, we convert each code into an embedding and send to Python
                const codes = Object.values(merged);
                const labels = codes.map((c) => c.label);
                const codeStrings = labels.map((l) => getCodeString(merged[l]));
                const codeOwners = labels.map((l) => merged[l].owners ?? []);
                const res = await evaluateTexts<{
                    distances: number[][];
                    positions: [number, number][];
                }>(
                    codeStrings,
                    labels,
                    codeOwners,
                    names,
                    this.name,
                    "network",
                    this.visualize.toString(),
                    exportPath,
                );
                // Infuse the results back into the reference codebook
                for (let i = 0; i < codes.length; i++) {
                    codes[i].position = res.positions[i];
                }
                // Remove sensitive data
                if (this.anonymize) {
                    for (const dataset of Object.values(this.dataset.data)) {
                        for (const chunk of Object.values(dataset)) {
                            for (const item of chunk.items) {
                                // TODO: Support subchunks
                                if ("items" in item) {
                                    logger.warn("Subchunks are not yet supported, skipping");
                                    continue;
                                }
                                item.nickname = this.dataset.getSpeakerName(item.uid);
                                if ((item as unknown as Record<string, unknown>).CurrentNickname) {
                                    delete (item as unknown as Record<string, unknown>)
                                        .CurrentNickname;
                                }
                            }
                        }
                    }
                }
                // Return in the format
                const pkg: CodebookComparison<DataChunk<DataItem>> = {
                    codebooks: allCodebooks,
                    names,
                    codes,
                    distances: res.distances,
                    source: this.dataset,
                    title: this.title,
                    weights,
                    groups: groupIndexes,
                    parameters: this.parameters,
                };
                return pkg;
            });
            // Run the HTTP server
            createOfflineBundle(
                `${exportPath}/network`,
                ["./src/evaluating/network", "./dist/evaluating/network"],
                `${exportPath}/network.json`,
            );
            // Return the results from the server
            const port = 8000 + Math.floor(Math.random() * 1999);
            return (
                (await launchServer(
                    port,
                    ["./src/evaluating/network", "./dist/evaluating/network"],
                    `${exportPath}/network.json`,
                )) ?? {}
            );
        });
    }
}
