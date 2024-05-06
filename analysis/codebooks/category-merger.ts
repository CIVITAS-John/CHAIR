import chalk from "chalk";
import { ResearchQuestion } from "../../constants.js";
import { ClusterTexts } from "../../utils/embeddings.js";
import { Codebook, Code, GetCategories } from "../../utils/schema.js";
import { MergeCategoriesByCluster, MergeCodesByCluster, UpdateCategories } from "./codebooks.js";
import { CodeConsolidator } from "./consolidator.js";

/** CategoryMerger: Merge categories based on similar names. Then, merge the names into one. */
export class CategoryMerger extends CodeConsolidator {
    /** Threshold: The similarity threshold for merging codes. */
    public Threshold: number;
    /** Penalty: The level penalty for merging codes. */
    public Penalty: number;
    /** Constructor: Create a new NameMerger. */
    constructor({Threshold = 0.6, Penalty = 0.05, Looping = false}: {Threshold?: number, Penalty?: number, Looping?: boolean}) {
        super();
        this.Looping = Looping;
        this.Penalty = Penalty;
        this.Threshold = Threshold;
    }
    /** SubunitFilter: Filter the subunits before chunking. */
    public SubunitFilter(Code: Code): boolean {
        return super.SubunitFilter(Code) && (Code.Categories?.length ?? 0) > 0;
    }
    /** OldCategories: The new categories for the codebook. */
    private OldCategories: string[] = [];
    /** NewCategories: The new categories for the codebook. */
    private NewCategories: Record<string, string[]> = {};
    /** Preprocess: Preprocess the subunits before chunking. */
    public async Preprocess(Codebook: Codebook, Codes: Code[]): Promise<Code[]> {
        // Collect the existing categories from the codebook
        var Categories = GetCategories(Codebook);
        // Map the categories to strings
        var CategoryStrings = Categories.map(Category => {
            var Text = `Category: ${Category}
Items:
${Codes.filter(Code => Code.Categories?.includes(Category)).map(Code => `- ${Code.Label}`).join("\n")}
`.trim();
// ${Codes.filter(Code => Code.Categories?.includes(Category)).map(Code => `- ${Code.Label} (${Code.Definitions![0]})`).join("\n")}
            return Text.trim();
        });
        // Codes.map(Code => Code.Categories).filter(Categories => Categories.findIndex(Category => Category == undefined) != -1)
        // Cluster categories using text embeddings
        var Clusters = await ClusterTexts(CategoryStrings, Categories, "consolidated", 
            "linkage-jc", "euclidean", "ward", this.Threshold.toString(), this.Penalty.toString(), "0.5"
        );
        this.OldCategories = Categories;
        this.NewCategories = MergeCategoriesByCluster(Clusters, Categories, Codes);
        // Check if we should stop - when nothing is merged
        this.Stopping = Object.keys(this.NewCategories).length == 0;
        return Codes;
    }
    /** BuildPrompts: Build the prompts for the code consolidator. */
    // In this case, we do not really use the LLM, so we just merge the codes
    public async BuildPrompts(Codebook: Codebook, Codes: Code[]): Promise<[string, string]> {
        var Count = Object.keys(this.NewCategories).length;
        // Ask LLMs to write new names for each category
        return [`
You are an expert in thematic analysis. You are assigning names for categories based on the merging results.
Make sure those names are concise, accurate, and related to the research question. Use 2-4 words and avoid over-generalization (e.g. "social interaction" instead of "interaction", "communication approach" instead of "communication").
${ResearchQuestion}
Always follow the output format:
---
Names for each category (${Count} in total):
1. {2-4 words for category 1}
...
${Count}. {2-4 words for category ${Count}}
---`.trim(), "Merge results:\n" + Object.keys(this.NewCategories).map((Category, Index) => `${Index + 1}.\n${Category.split("|").map(Current => `- ${Current}`).join("\n")}`).join("\n\n")];
    }
    /** ParseResponse: Parse the response for the code consolidator. */
    public async ParseResponse(Codebook: Codebook, Codes: Code[], Lines: string[]) {
        var Results: string[] = [];
        // Parse the categories
        for (var I = 0; I < Lines.length; I++) {
            var Line = Lines[I];
            if (Line == "" || Line.startsWith("---")) continue;
            var Match = Line.match(/^(\d+)\./);
            if (Match) {
                var Category = Line.substring(Match[0].length).trim().toLowerCase();
                Results.push(Category);
            }
        }
        // Update the categories
        if (Results.length != Object.keys(this.NewCategories).length) throw new Error(`Invalid response: ${Results.length} results for ${this.OldCategories.length} categories.`);
        UpdateCategories(Object.keys(this.NewCategories), Results, Codes);
        // Check if we are done
        var OldLength = this.OldCategories.length;
        var NewLength = GetCategories(Codebook).length;
        if (OldLength == NewLength) this.Stopping = true;
        console.log(chalk.green(`Statistics: Categories merged from ${OldLength} to ${NewLength}`));
        return 0;
    }
}