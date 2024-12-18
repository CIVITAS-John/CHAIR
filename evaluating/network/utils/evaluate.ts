import type { Code, CodebookComparison, CodebookEvaluation, DataChunk, DataItem } from "../../../utils/schema.js";

import { GetConsolidatedSize } from "./dataset.js";
import { BuildSemanticGraph } from "./graph.js";
import type { Component, Graph } from "./schema.js";
import type { Parameters } from "./utils.js";
import { CalculateJSD } from "./utils.js";

/** EvaluateCodebooks: Evaluate all codebooks based on the network structure. */
export function EvaluateCodebooks(Dataset: CodebookComparison<DataChunk<DataItem>>, Parameters: Parameters): Record<string, CodebookEvaluation> {
    const Results: Record<string, CodebookEvaluation> = {};
    const Observations: number[][] = [[]];
    // Prepare for the results
    const Codebooks = Dataset.Codebooks;
    const Names = Dataset.Names;
    for (let I = 1; I < Codebooks.length; I++) {
        Results[Names[I]] = { Coverage: 0, Density: 0, Novelty: 0, Divergence: 0 };
        Observations.push([]);
    }
    // Calculate weights per node
    const Graph = BuildSemanticGraph(Dataset, Parameters);
    const NodeWeights: Map<string, number> = new Map<string, number>();
    let TotalWeight = 0;
    for (const Node of Graph.Nodes) {
        const Weight = Node.TotalWeight / (Dataset.TotalWeight ?? NaN);
        Observations[0].push(Weight);
        NodeWeights.set(Node.ID, Weight);
        TotalWeight += Weight;
    }
    // The expectations are made based on (consolidate codes in each codebook) / (codes in the baseline)
    const Consolidated = Codebooks.map((Codebook, I) => {
        if (I === 0) {
            return Object.keys(Codebooks[0]).length;
        }
        return GetConsolidatedSize(Codebooks[0], Codebook);
    });
    // Check if each node is covered by the codebooks
    let TotalNovelty = 0;
    for (const Node of Graph.Nodes) {
        const Weight = NodeWeights.get(Node.ID) ?? NaN;
        // Check novelty
        if (Node.Novel) {
            TotalNovelty += Weight;
        }
        // Calculate on each codebook
        for (let I = 1; I < Codebooks.length; I++) {
            const Result = Results[Names[I]];
            const Observed = Node.Weights[I];
            Result.Coverage += Weight * Observed;
            Result.Novelty += Weight * Observed * (Node.Novel ? 1 : 0);
            Observations[I].push(Observed);
        }
    }
    // Finalize the results
    for (let I = 1; I < Codebooks.length; I++) {
        const Result = Results[Names[I]];
        Result.Coverage = Result.Coverage / TotalWeight;
        Result.Density = Consolidated[I] / Consolidated[0] / Result.Coverage;
        Result.Novelty = Result.Novelty / TotalNovelty;
        Result.Divergence = Math.sqrt(CalculateJSD(Observations[0], Observations[I]));
        Result.Count = Object.keys(Codebooks[I]).length;
        Result.Consolidated = Consolidated[I];
    }
    return Results;
}

/** EvaluateUsers: Evaluate all users based on the network structure. */
export function EvaluateUsers(Dataset: CodebookComparison<DataChunk<DataItem>>, Parameters: Parameters): Record<string, CodebookEvaluation> {
    const Results: Record<string, CodebookEvaluation> = {};
    const Observations: number[][] = [[]];
    // Prepare for the results
    const Users = Array.from(Dataset.UserIDToNicknames?.keys() ?? []);
    Users.unshift("# Everyone");
    for (let I = 1; I < Users.length; I++) {
        Results[Users[I]] = { Coverage: 0, Novelty: 0, Divergence: 0, Count: 0 };
        Observations.push([]);
    }
    // Prepare for the examples
    const Examples: Map<string, number> = new Map<string, number>();
    Object.values(Dataset.Source.Data)
        .flatMap((Chunk) => Object.entries(Chunk))
        .flatMap(([_Key, Value]) => Value.AllItems ?? [])
        .forEach((Item) => {
            Examples.set(Item.ID, Users.indexOf(Item.UserID));
            Results[Item.UserID].Count += 1;
        });
    // Calculate weights per user
    const Weights = new Array<number>(Users.length).fill(1);
    Weights[0] = 0;
    // Calculate weights per node
    const Graph = BuildSemanticGraph(
        Dataset,
        Parameters,
        Users.length,
        (Code) => {
            const Owners = new Set<number>();
            Owners.add(0);
            for (let Example of Code.Examples ?? []) {
                Example = Example.split("|||")[0];
                if (Examples.has(Example)) {
                    const User = Examples.get(Example) ?? NaN;
                    if (!Owners.has(User)) {
                        Owners.add(Examples.get(Example) ?? NaN);
                    }
                }
            }
            return Owners;
        },
        Weights,
    );
    const NodeWeights: Map<string, number> = new Map<string, number>();
    let TotalWeight = 0;
    for (const Node of Graph.Nodes) {
        const Weight = Node.TotalWeight / (Users.length - 1);
        Observations[0].push(Weight);
        NodeWeights.set(Node.ID, Weight);
        TotalWeight += Weight;
    }
    // Check if each node is covered by the codebooks
    let TotalNovelty = 0;
    for (const Node of Graph.Nodes) {
        const Weight = NodeWeights.get(Node.ID) ?? NaN;
        // Check novelty
        if (Node.Novel) {
            TotalNovelty += Weight;
        }
        // Calculate on each user
        for (let I = 1; I < Users.length; I++) {
            const Result = Results[Users[I]];
            const Observed = Node.Weights[I];
            Result.Coverage += Weight * Observed;
            Result.Novelty += Weight * Observed * (Node.Novel ? 1 : 0);
            Observations[I].push(Observed);
        }
    }
    // Finalize the results
    for (let I = 1; I < Users.length; I++) {
        const Result = Results[Users[I]];
        Result.Coverage = Result.Coverage / TotalWeight;
        Result.Novelty = Result.Novelty / TotalNovelty;
        Result.Divergence = Math.sqrt(CalculateJSD(Observations[0], Observations[I]));
    }
    return Results;
}

/** Evaluate: Evaluate all codebooks per cluster, based on the network structure. */
export function EvaluatePerCluster(
    Dataset: CodebookComparison<DataChunk<DataItem>>,
    Graph: Graph<Code>,
    _Parameters: Parameters,
): { Component: Component<Code>; Coverages: number[]; Differences: number[] }[] {
    const Results: { Component: Component<Code>; Coverages: number[]; Differences: number[] }[] = [];
    // Prepare for the results
    const Codebooks = Dataset.Codebooks;
    let TotalCoverages = Dataset.Names.map(() => 0);
    // Calculate weights per cluster
    if (!Graph.Components) {
        throw new Error("Graph has no components");
    }
    for (const Cluster of Graph.Components) {
        let TotalWeight = 0;
        let Coverages = Dataset.Names.map(() => 0);
        // Check if each node is covered by the codebooks
        for (const Node of Cluster.Nodes) {
            const Weight = Node.TotalWeight / (Dataset.TotalWeight ?? NaN);
            TotalWeight += Weight;
            // Calculate on each codebook
            for (let I = 0; I < Codebooks.length; I++) {
                const Observed = Node.Weights[I];
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
    for (const Result of Results) {
        Result.Differences = Result.Coverages.map((Coverage, I) => Coverage / TotalCoverages[I + 1] - 1);
    }
    return Results;
}
