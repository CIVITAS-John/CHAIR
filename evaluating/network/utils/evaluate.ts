import { Code, CodebookComparison, CodebookEvaluation } from "../../../utils/schema.js";
import { GetConsolidatedSize } from "./dataset.js";
import { BuildSemanticGraph } from "./graph.js";
import { CalculateJSD, Parameters } from './utils.js';
import { Graph, Component } from './schema.js';

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
    var NodeWeights: Map<string, number> = new Map<string, number>();
    var TotalWeight: number = 0;
    for (var Node of Graph.Nodes) {
        var Weight = Node.TotalWeight / Dataset.TotalWeight!;
        Observations[0].push(Weight);
        NodeWeights.set(Node.ID, Weight);
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
        var Weight = NodeWeights.get(Node.ID)!;
        // Novelty
        var Novel = Node.Owners.size == 1 + (Node.Owners.has(0) ? 1 : 0);
        if (Novel) TotalNovelty += Weight;
        // Calculate on each codebook
        for (var I = 1; I < Codebooks.length; I++) {
            var Result = Results[Names[I]];
            var Observed = Node.Weights[I];
            Result["Coverage"] += Weight * Observed;
            Result["Novelty"] += Weight * Observed * (Novel ? 1 : 0);
            Observations[I].push(Observed);
        }
    }
    // Finalize the results
    for (var I = 1; I < Codebooks.length; I++) {
        var Result = Results[Names[I]];
        Result["Coverage"] = Result["Coverage"] / TotalWeight;
        Result["Density"] = Consolidated[I] / Consolidated[0] / Result["Coverage"];
        Result["Novelty"] = Result["Novelty"] / TotalNovelty;
        Result["Divergence"] = Math.sqrt(CalculateJSD(Observations[0], Observations[I]));
        Result["Count"] = Object.keys(Codebooks[I]).length;
        Result["Consolidated"] = Consolidated[I];
    }
    return Results;
}

/** Evaluate: Evaluate all codebooks per cluster, based on the network structure. */
export function EvaluatePerCluster(Dataset: CodebookComparison<any>, Graph: Graph<Code>, Parameters: Parameters): { Component: Component<Code>, Coverages: number[] }[] {
    var Results: { Component: Component<Code>, Coverages: number[] }[] = [];
    // Prepare for the results
    var Codebooks = Dataset.Codebooks;
    // Calculate weights per cluster
    for (var Cluster of Graph.Components!) {
        var TotalWeight = 0;
        var Coverages = Dataset.Names.map(() => 0);
        // Check if each node is covered by the codebooks
        for (var Node of Cluster.Nodes) {
            var Weight = Node.TotalWeight / Dataset.TotalWeight!;
            TotalWeight += Weight;
            // Calculate on each codebook
            for (var I = 0; I < Codebooks.length; I++) {
                var Observed = Node.Weights[I];
                Coverages[I] += Weight * Observed;
            }
        }
        Coverages = Coverages.map(Coverage => Coverage / TotalWeight);
        // Put it back to the results
        console.log(Coverages);
        Results.push({ Component: Cluster, Coverages: Coverages.slice(1) });
    }
    return Results;
}