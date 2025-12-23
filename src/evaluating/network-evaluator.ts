/**
 * Network-based Codebook Evaluation
 *
 * This module provides network-based evaluation of qualitative codebooks by:
 * - Building semantic graphs from code embeddings and distances
 * - Calculating codebook quality metrics (coverage, overlap, novelty, divergence)
 * - Generating interactive web-based visualizations
 * - Supporting multi-codebook comparison and analysis
 *
 * The evaluation process:
 * 1. Merges codes from multiple codebooks into a unified reference
 * 2. Computes semantic embeddings and position calculations via Python
 * 3. Builds a network graph with weighted edges based on code similarity
 * 4. Calculates evaluation metrics for each codebook
 * 5. Creates an interactive visualization bundle for exploration
 */

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
import { withCache } from "../utils/io/cache.js";
import { evaluateTexts } from "../utils/ai/embeddings.js";
import { logger } from "../utils/core/logger.js";
import { getMedian } from "../utils/core/misc.js";
import { createOfflineBundle, launchServer } from "../utils/runtime/server.js";

import { CodebookEvaluator } from "./codebooks.js";

/**
 * Converts a code to a string representation for embedding calculation.
 * Combines the code label with its first definition if available.
 *
 * @param code - The code to convert to a string
 * @returns A string combining the code's label and definition
 */
const getCodeString = (code: Code) => {
    let text = code.label;
    if ((code.definitions?.length ?? 0) > 0) {
        text += `Label: ${code.label}\nDefinition: ${(code.definitions ?? [])[0]}`;
    }
    return text;
};

/**
 * Network-based evaluator for qualitative codebooks.
 *
 * This evaluator creates a semantic network of codes from multiple codebooks and uses
 * graph-based metrics to evaluate codebook quality. It:
 * - Merges codes from all codebooks into a unified reference
 * - Calculates semantic embeddings and 2D positions for visualization
 * - Builds weighted graphs based on code similarity
 * - Computes quality metrics (coverage, overlap, novelty, divergence)
 * - Generates interactive visualizations for exploration
 * - Optionally anonymizes sensitive data in the dataset
 *
 * The evaluator supports both individual codebooks and grouped codebooks,
 * with customizable weighting schemes for different analysis scenarios.
 *
 * @template TUnit - Type of data unit (e.g., DataChunk)
 * @template TSubunit - Type of data subunit (defaults to DataItem)
 */
export class NetworkEvaluator<
    TUnit extends DataChunk<TSubunit>,
    TSubunit extends DataItem = DataItem,
> extends CodebookEvaluator {
    protected get _prefix() {
        return logger.prefixed(logger.prefix, "NetworkEvaluator");
    }

    /** The name of the evaluator. */
    override name = "network-evaluator";

    /** Whether to visualize the evaluation (used by Python embedding service). */
    visualize = false;

    /** The dataset underlying the codebooks being evaluated. */
    dataset: Dataset<TUnit>;

    /**
     * Whether the dataset should be anonymized in the visualization.
     * When true, sensitive user information is replaced with nicknames.
     */
    anonymize: boolean;

    /** The title displayed in the visualization. */
    title: string;

    /**
     * Extra parameters passed to the visualization.
     * These can control visualization behavior like useNearOwners, useExtendedChunk, etc.
     */
    parameters: Record<string, unknown> = {};

    /**
     * Initializes the network evaluator with dataset and configuration.
     *
     * @param dataset - The dataset containing the qualitative data
     * @param anonymize - Whether to anonymize user data (default: true)
     * @param title - Title for the visualization (default: "Network Evaluator")
     * @param parameters - Additional parameters for the visualization
     */
    constructor({
        dataset,
        anonymize,
        title,
        parameters,
    }: {
        dataset: Dataset<TUnit>;
        anonymize?: boolean;
        title?: string;
        parameters?: Record<string, unknown>;
    }) {
        super();
        this.dataset = dataset;
        this.anonymize = anonymize ?? true;
        this.title = title ?? "Network Evaluator";
        this.parameters = parameters ?? {};
    }

    /**
     * Evaluates multiple codebooks against a reference codebook using network analysis.
     *
     * The evaluation process:
     * 1. Collects and merges all codebooks into a unified reference
     * 2. Calculates code weights based on codebook sizes (1/ln(max(median_size, code_count)))
     * 3. Converts codes to embeddings and computes 2D positions via Python
     * 4. Anonymizes dataset if configured
     * 5. Creates an offline visualization bundle
     * 6. Launches an HTTP server for interactive exploration
     *
     * Weight calculation: Smaller codebooks get higher weights to balance contribution.
     * Uses logarithmic scaling to prevent very small codebooks from dominating.
     *
     * @param reference - The reference/baseline codebook (typically merged from all codebooks)
     * @param codebooks - Map of codebook names to codebooks to evaluate
     * @param groups - Map of group names to [merged codebook, member names]
     * @param exportPath - Directory to export results and visualization (default: "./known")
     * @returns Promise resolving to evaluation results for each codebook
     */
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
            const sizes: number[] = [];
            // Collect the names of the codebooks and groups
            for (const [name, codebook] of Object.entries(codebooks)) {
                names.push(name);
                groupIndexes.push([]);
                allCodebooks.push(codebook);
                sizes.push(Object.keys(codebook).length);
            }
            for (const [name, group] of Object.entries(groups)) {
                names.push(`group: ${name}`);
                groupIndexes.push(group[1].map((c) => names.indexOf(c)));
                allCodebooks.push(group[0]);
            }
            // Get the median codebook size
            const medianSize = getMedian(sizes);
            // Parse the codebooks and groups
            const weights = names.map((name, idx) => {
                if (idx === 0 || name.startsWith("group: ")) {
                    return 0;
                }
                const fields = name.split("~");
                const value = parseFloat(fields[fields.length - 1]);
                if (isNaN(value)) {
                    // By default, calculate weight as 1 / ln(max(median(# of everyones' codes), # of codes))
                    var size = Object.keys(allCodebooks[idx]).length;
                    return 1 / (size == 0 ? 1 : Math.log(Math.max(size, medianSize)));
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
