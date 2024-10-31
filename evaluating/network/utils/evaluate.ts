import { Code, CodebookComparison, CodebookEvaluation } from "../../../utils/schema.js";
import { GetConsolidatedSize } from "./dataset.js";
import { BuildSemanticGraph } from "./graph.js";
import { CalculateJSD, Parameters } from "./utils.js";
import { Graph, Component } from "./schema.js";

/** EvaluateCodebooks: Evaluate all codebooks based on the network structure. */
export function EvaluateCodebooks(Dataset: CodebookComparison<any>, Parameters: Parameters): Record<string, CodebookEvaluation> {
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
        // Check novelty
        if (Node.Novel) TotalNovelty += Weight;
        // Calculate on each codebook
        for (var I = 1; I < Codebooks.length; I++) {
            var Result = Results[Names[I]];
            var Observed = Node.Weights[I];
            Result["Coverage"] += Weight * Observed;
            Result["Novelty"] += Weight * Observed * (Node.Novel ? 1 : 0);
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

/** EvaluateUsers: Evaluate all users based on the network structure. */
export function EvaluateUsers(Dataset: CodebookComparison<any>, Parameters: Parameters): Record<string, CodebookEvaluation> {
    var Results: Record<string, CodebookEvaluation> = {};
    var Observations: number[][] = [[]];
    // Prepare for the results
    var Users = Array.from(Dataset.UserIDToNicknames?.keys() ?? []);
    Users.unshift("# Everyone");
    for (var I = 1; I < Users.length; I++) {
        Results[Users[I]] = { Coverage: 0, Novelty: 0, Divergence: 0, Count: 0 };
        Observations.push([]);
    }
    // Prepare for the examples
    var Examples: Map<string, number> = new Map<string, number>();
    Object.values(Dataset.Source.Data)
        .flatMap((Chunk) => Object.entries(Chunk))
        .flatMap(([Key, Value]) => Value.AllItems ?? [])
        .forEach(Item => {
            Examples.set(Item.ID, Users.indexOf(Item.UserID));
            Results[Item.UserID]["Count"] += 1;
        });
    // Calculate weights per user
    var Weights = new Array(Users.length).fill(1);
    Weights[0] = 0;
    // Calculate weights per node
    var Graph = BuildSemanticGraph(Dataset, Parameters, Users.length, (Code) => {
        var Owners = new Set<number>();
        Owners.add(0);
        for (var Example of Code.Examples ?? []) {
            Example = Example.split("|||")[0];
            if (Examples.has(Example)) {
                var User = Examples.get(Example)!;
                if (!Owners.has(User)) {
                    Owners.add(Examples.get(Example)!);
                }
            }
        }
        return Owners;
    }, Weights);
    var NodeWeights: Map<string, number> = new Map<string, number>();
    var TotalWeight: number = 0;
    for (var Node of Graph.Nodes) {
        var Weight = Node.TotalWeight / (Users.length - 1);
        Observations[0].push(Weight);
        NodeWeights.set(Node.ID, Weight);
        TotalWeight += Weight;
    }
    // Check if each node is covered by the codebooks
    var TotalNovelty = 0;
    for (var Node of Graph.Nodes) {
        var Weight = NodeWeights.get(Node.ID)!;
        // Check novelty
        if (Node.Novel) TotalNovelty += Weight;
        // Calculate on each user
        for (var I = 1; I < Users.length; I++) {
            var Result = Results[Users[I]];
            var Observed = Node.Weights[I];
            Result["Coverage"] += Weight * Observed;
            Result["Novelty"] += Weight * Observed * (Node.Novel ? 1 : 0);
            Observations[I].push(Observed);
        }
    }
    // Finalize the results
    for (var I = 1; I < Users.length; I++) {
        var Result = Results[Users[I]];
        Result["Coverage"] = Result["Coverage"] / TotalWeight;
        Result["Novelty"] = Result["Novelty"] / TotalNovelty;
        Result["Divergence"] = Math.sqrt(CalculateJSD(Observations[0], Observations[I]));
    }
    return Results;
}

/** Evaluate: Evaluate all codebooks per cluster, based on the network structure. */
export function EvaluatePerCluster(
    Dataset: CodebookComparison<any>,
    Graph: Graph<Code>,
    Parameters: Parameters,
): { Component: Component<Code>; Coverages: number[]; Differences: number[] }[] {
    var Results: { Component: Component<Code>; Coverages: number[]; Differences: number[] }[] = [];
    // Prepare for the results
    var Codebooks = Dataset.Codebooks;
    var TotalCoverages = Dataset.Names.map(() => 0);
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
                TotalCoverages[I] += Weight * Observed;
            }
        }
        Coverages = Coverages.map((Coverage) => Coverage / TotalWeight);
        // Put it back to the results
        Results.push({ Component: Cluster, Coverages: Coverages.slice(1), Differences: [] });
    }
    // Calculate the total coverage and relative difference
    TotalCoverages = TotalCoverages.map((Coverage) => Coverage / TotalCoverages[0]);
    for (var Result of Results) {
        Result.Differences = Result.Coverages.map((Coverage, I) => Coverage / TotalCoverages[I + 1] - 1);
    }
    return Results;
}
