import md5 from "md5";

import { MergeCodebooks } from "../consolidating/codebooks.js";
import { GetSpeakerName } from "../constants.js";
import { EvaluateTexts } from "../utils/embeddings.js";
import { ReadOrBuildCache } from "../utils/file.js";
import type {
    Code,
    Codebook,
    CodebookComparison,
    CodebookEvaluation,
    DataChunk,
    DataItem,
    Dataset,
} from "../utils/schema.js";
import { CreateOfflineBundle, CreateServer } from "../utils/server.js";

import { CodebookEvaluator } from "./codebooks.js";

/** NetworkEvaluator: A network evaluator of codebook against a reference codebook (#0) with potential human inputs. */
export class NetworkEvaluator extends CodebookEvaluator {
    /** Name: The name of the evaluator. */
    public Name = "network-evaluator";
    /** Visualize: Whether we visualize the evaluation. */
    public Visualize = false;
    /** Dataset: The dataset underlying the codebooks. */
    public Dataset: Dataset<DataChunk<DataItem>>;
    /** Anonymize: Whether the dataset should be anonymized. */
    public Anonymize: boolean;
    /** Title: The title of the evaluator. */
    public Title: string;
    /** constructor: Initialize the evaluator. */
    public constructor({
        Dataset,
        Anonymize,
        Title,
    }: {
        Dataset: Dataset<DataChunk<DataItem>>;
        Anonymize?: boolean;
        Title?: string;
    }) {
        super();
        this.Dataset = Dataset;
        this.Anonymize = Anonymize ?? true;
        this.Title = Title ?? "Network Evaluator";
    }
    /** Evaluate: Evaluate a number of codebooks. */
    public async Evaluate(
        Codebooks: Codebook[],
        Names: string[],
        ExportPath?: string,
    ): Promise<Record<string, CodebookEvaluation>> {
        const Hash = md5(JSON.stringify(Codebooks));
        // Weights
        const Weights = Names.map((Name, Index) => {
            if (Index === 0 || Name.startsWith("group:")) {
                return 0;
            }
            const Fields = Name.split("~");
            const Value = parseFloat(Fields[Fields.length - 1]);
            if (isNaN(Value)) {
                return 1;
            }
            Names[Index] = Fields.slice(0, Fields.length - 1).join("~");
            return Value;
        });
        // Build the network information
        await ReadOrBuildCache(`${ExportPath}/network`, Hash, async () => {
            // We treat the first input as the reference codebook
            Names[0] = "baseline";
            const Merged = MergeCodebooks(Codebooks, true);
            // Then, we convert each code into an embedding and send to Python
            const Codes = Object.values(Merged);
            const Labels = Codes.map((Code) => Code.Label);
            const CodeStrings = Labels.map((Label) => GetCodeString(Merged[Label]));
            const CodeOwners = Labels.map((Label) => Merged[Label].Owners!);
            const Result = await EvaluateTexts<{
                Distances: number[][];
                Positions: [number, number][];
            }>(
                CodeStrings,
                Labels,
                CodeOwners,
                Names,
                this.Name,
                "network",
                this.Visualize.toString(),
                ExportPath ?? "./known",
            );
            // Infuse the results back into the reference codebook
            for (let I = 0; I < Codes.length; I++) {
                Codes[I].Position = Result.Positions[I];
            }
            // Remove sensitive data
            if (this.Anonymize) {
                for (const Dataset of Object.values(this.Dataset.Data)) {
                    for (const Chunk of Object.values(Dataset)) {
                        for (const Item of Chunk.AllItems ?? []) {
                            Item.Nickname = GetSpeakerName(Item.UserID);
                            if ((Item as unknown as Record<string, unknown>).CurrentNickname) {
                                delete (Item as unknown as Record<string, unknown>).CurrentNickname;
                            }
                        }
                    }
                }
            }
            // Return in the format
            const Package: CodebookComparison<DataChunk<DataItem>> = {
                Codebooks,
                Names,
                Codes,
                Distances: Result.Distances,
                Source: this.Dataset,
                Title: this.Title,
                Weights,
            };
            return Package;
        });
        // Run the HTTP server
        CreateOfflineBundle(
            `${ExportPath}/network`,
            ["evaluating/network", "out/evaluating/network"],
            `${ExportPath}/network.json`,
        );
        // Return the results from the server
        return (
            (await CreateServer(
                8080,
                ["evaluating/network", "out/evaluating/network"],
                `${ExportPath}/network.json`,
            )) ?? {}
        );
    }
}

/** GetCodeString: Get the strings of the codes. */
export function GetCodeString(Code: Code): string {
    let Text = `Label: ${Code.Label}`;
    if ((Code.Definitions?.length ?? 0) > 0) {
        Text += `\nDefinition: ${Code.Definitions![0]}`;
    }
    return Text;
}
