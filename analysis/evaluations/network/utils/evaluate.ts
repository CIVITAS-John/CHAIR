import { CodebookComparison, CodebookEvaluation } from "../../../../utils/schema.js";
import { FindConsolidatedCode } from "./dataset.js";
import { BuildSemanticGraph } from "./graph.js";
import { Parameters } from './utils.js';

/** Evaluate: Evaluate all codebooks based on the network structure. */
export function Evaluate(Dataset: CodebookComparison<any>, Parameters: Parameters): Record<string, CodebookEvaluation> {
    var Results: Record<string, CodebookEvaluation> = {};
    // Prepare for the results
    var Codebooks = Dataset.Codebooks;
    var Names = Dataset.Names;
    for (var I = 1; I < Codebooks.length; I++) {
        Results[Names[I]] = { Coverage: 0, Density: 0, Novelty: 0, Conformity: 0 };
    }
    // Calculate weights per node
    var Graph = BuildSemanticGraph(Dataset, Parameters);
    var Weights: Map<string, number> = new Map<string, number>();
    var TotalWeight: number = 0;
    var TotalCodebooks = Codebooks.length - 1;
    for (var Node of Graph.Nodes) {
        var Weight = Node.Data.Owners?.length ?? 0;
        if (Node.Data.Owners?.includes(0)) Weight--;
        Weight = Weight / TotalCodebooks;
        Weights.set(Node.ID, Weight);
        TotalWeight += Weight;
    }
    // Check if each node is covered by the codebooks
    var TotalNovelty = 0; var TotalConformity = 0;
    for (var Node of Graph.Nodes) {
        var Weight = Weights.get(Node.ID)!;
        var Owners = Parameters.UseNearOwners ? Node.NearOwners : Node.Owners;
        var Novel = Owners.size == 1 + (Node.Owners.has(0) ? 1 : 0);
        if (Novel) TotalNovelty += Weight;
        else TotalConformity += Weight;
        for (var Owner of Node.Owners) {
            if (Owner == 0) continue;
            Results[Names[Owner]]["Coverage"] += Weight;
            if (Novel) {
                Results[Names[Owner]]["Novelty"] += Weight;
            } else {
                Results[Names[Owner]]["Conformity"] += Weight;
            }
        }
    }
    // Finalize the results
    for (var I = 1; I < Codebooks.length; I++) {
        var Result = Results[Names[I]];
        var Consolidated = new Set(Object.keys(Codebooks[I]).map(Code => FindConsolidatedCode(Codebooks[0], Code)?.Label).filter(Code => Code)).size;
        Result["Coverage"] = Result["Coverage"] / TotalWeight;
        Result["Density"] = Consolidated / Graph.Nodes.length / Result["Coverage"];
        Result["Novelty"] = Result["Novelty"] / TotalNovelty;
        Result["Conformity"] = Result["Conformity"] / TotalConformity;
    }
    return Results;
}