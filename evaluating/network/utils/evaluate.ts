import { CodebookComparison, CodebookEvaluation } from "../../../utils/schema.js";
import { FindConsolidatedCode, GetConsolidatedSize } from "./dataset.js";
import { BuildSemanticGraph } from "./graph.js";
import { CalculateJSD, Parameters } from './utils.js';

/** Evaluate: Evaluate all codebooks based on the network structure. */
export function Evaluate(Dataset: CodebookComparison<any>, Parameters: Parameters): Record<string, CodebookEvaluation> {
    var Results: Record<string, CodebookEvaluation> = {};
    var Observations: number[][] = [[]];
    // Prepare for the results
    var Codebooks = Dataset.Codebooks;
    var Names = Dataset.Names;
    for (var I = 1; I < Codebooks.length; I++) {
        Results[Names[I]] = { Coverage: 0, Density: 0, Novelty: 0, Divergence: 0 };
        Observations.push([]);
    }
    // Calculate weights per node
    var Graph = BuildSemanticGraph(Dataset, Parameters);
    var Weights: Map<string, number> = new Map<string, number>();
    var TotalWeight: number = 0;
    var TotalCodebooks = Codebooks.length - 1;
    for (var Node of Graph.Nodes) {
        // Near-owner count as half
        var Weight = Node.Owners.size + (Node.NearOwners.size - Node.Owners.size) * 0.5;
        if (Node.Owners.has(0)) Weight--; // Discount the baseline
        Weight = Weight / TotalCodebooks;
        Observations[0].push(Weight);
        Weights.set(Node.ID, Weight);
        TotalWeight += Weight;
    }
    // The expectations are made based on (consolidate codes in each codebook) / (codes in the baseline)
    var Consolidated = Codebooks.map((Codebook, I) => {
        if (I == 0) return Object.keys(Codebooks[0]).length;
        return GetConsolidatedSize(Codebooks[0], Codebook);
    });
    // Check if each node is covered by the codebooks
    var TotalNovelty = 0;
    for (var Node of Graph.Nodes) {
        var Weight = Weights.get(Node.ID)!;
        // Novelty
        var Novel = Node.Owners.size == 1 + (Node.Owners.has(0) ? 1 : 0);
        if (Novel) TotalNovelty += Weight;
        // Calculate on each codebook
        for (var I = 1; I < Codebooks.length; I++) {
            var Result = Results[Names[I]];
            var Observed = Node.Owners.has(I) ? 1 : Node.NearOwners.has(I) ? 0.5 : 0;
            Result["Coverage"] += Weight * Observed;
            Result["Novelty"] += Weight * (Observed == 1 ? 1 : 0) * (Novel ? 1 : 0);
            Observations[I].push(Observed);
        }
    }
    // Finalize the results
    console.log(Consolidated);
    for (var I = 1; I < Codebooks.length; I++) {
        var Result = Results[Names[I]];
        Result["Coverage"] = Result["Coverage"] / TotalWeight;
        Result["Density"] = Consolidated[I] / Consolidated[0] / Result["Coverage"];
        Result["Novelty"] = Result["Novelty"] / TotalNovelty;
        Result["Divergence"] = Math.sqrt(CalculateJSD(Observations[0], Observations[I]));
    }
    return Results;
}