import md5 from "md5";

import { mergeCodebooks } from "../consolidating/codebooks";
import type {
    Code,
    Codebook,
    CodebookComparison,
    CodebookEvaluation,
    DataChunk,
    DataItem,
    Dataset,
} from "../schema";
import type { IDStrFunc } from "../steps/base-step";
import type { EmbedderObject } from "../utils/embeddings";
import { evaluateTexts } from "../utils/embeddings";
import { withCache } from "../utils/file";
import { logger } from "../utils/logger";
import { createOfflineBundle, launchServer } from "../utils/server";

import { CodebookEvaluator } from "./codebooks";

/** Get the strings of the codes. */
const getCodeString = (code: Code) => {
    let text = `Label: ${code.label}`;
    if ((code.definitions?.length ?? 0) > 0) {
        text += `\nDefinition: ${(code.definitions ?? [])[0]}`;
    }
    return text;
};

/** NetworkEvaluator: A network evaluator of codebook against a reference codebook (#0) with potential human inputs. */
export class NetworkEvaluator<
    TUnit extends DataChunk<TSubunit>,
    TSubunit extends DataItem = DataItem,
> extends CodebookEvaluator {
    protected _idStr: IDStrFunc;

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

    /** Initialize the evaluator. */
    constructor(
        idStr: IDStrFunc,
        /** The embedder object for the merger. */
        public embedder: EmbedderObject,
        {
            dataset,
            anonymize,
            title,
        }: {
            dataset: Dataset<TUnit>;
            anonymize?: boolean;
            title?: string;
        },
    ) {
        super();
        this._idStr = (mtd?: string) => idStr(`NetworkEvaluator${mtd ? `#${mtd}` : ""}`);
        this.dataset = dataset;
        this.anonymize = anonymize ?? true;
        this.title = title ?? "Network Evaluator";
    }

    /** Evaluate a number of codebooks. */
    override async evaluate(
        codebooks: Codebook[],
        names: string[],
        exportPath?: string,
    ): Promise<Record<string, CodebookEvaluation>> {
        const _id = this._idStr("evaluate");

        const hash = md5(JSON.stringify(codebooks));
        // Weights
        const weights = names.map((name, idx) => {
            if (idx === 0 || name.startsWith("group:")) {
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
        await withCache(this._idStr, `${exportPath}/network`, hash, async () => {
            // We treat the first input as the reference codebook
            names[0] = "baseline";
            const merged = mergeCodebooks(codebooks, true);
            // Then, we convert each code into an embedding and send to Python
            const codes = Object.values(merged);
            const labels = codes.map((c) => c.label);
            const codeStrings = labels.map((l) => getCodeString(merged[l]));
            const codeOwners = labels.map((l) => merged[l].owners ?? []);
            const res = await evaluateTexts<{
                distances: number[][];
                positions: [number, number][];
            }>(
                this._idStr,
                this.embedder,
                codeStrings,
                labels,
                codeOwners,
                names,
                this.name,
                "network",
                this.visualize.toString(),
                exportPath ?? "./known",
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
                                logger.warn("Subchunks are not yet supported, skipping", _id);
                                continue;
                            }
                            item.nickname = this.dataset.getSpeakerName(item.uid);
                            if ((item as unknown as Record<string, unknown>).CurrentNickname) {
                                delete (item as unknown as Record<string, unknown>).CurrentNickname;
                            }
                        }
                    }
                }
            }
            // Return in the format
            const pkg: CodebookComparison<DataChunk<DataItem>> = {
                codebooks,
                names,
                codes,
                distances: res.distances,
                source: this.dataset,
                title: this.title,
                weights,
            };
            return pkg;
        });
        // Run the HTTP server
        createOfflineBundle(
            `${exportPath}/network`,
            ["evaluating/network", "out/evaluating/network"],
            `${exportPath}/network.json`,
        );
        // Return the results from the server
        return (
            (await launchServer(
                8080,
                ["evaluating/network", "out/evaluating/network"],
                `${exportPath}/network.json`,
            )) ?? {}
        );
    }
}
