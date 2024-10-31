import { Code, CodebookComparison, Dataset, DataChunk, DataItem } from "../../../utils/schema.js";
import { Node, Link, Graph, Component } from "./schema.js";
import * as graphology from "graphology";
import * as graphologyLibrary from "graphology-library";
import { InverseLerp, Parameters } from "./utils.js";

/** BuildSemanticGraph: Build a semantic code graph from the dataset. */
export function BuildSemanticGraph(Dataset: CodebookComparison<any>, 
    Parameter: Parameters = new Parameters(), AllOwners = Dataset.Codebooks.length,
    OwnerGetter = (Code: Code) => new Set(Code.Owners), OwnerWeights = Dataset.Weights!): Graph<Code> {
    var Nodes: Node<Code>[] = Dataset.Codes.map((Code, Index) => ({
        Type: "Code",
        ID: Index.toString(),
        Data: Code,
        Links: [],
        Owners: OwnerGetter(Code),
        NearOwners: OwnerGetter(Code),
        Weights: new Array(AllOwners).fill(0),
        TotalWeight: 0,
        Neighbors: 0,
        Size: Math.sqrt(Code.Examples?.length ?? 1),
        x: 0,
        y: 0,
    })); // x: Code.Position![0], y: Code.Position![1]
    var Links: Map<string, Link<Code>> = new Map();
    var MaxDistance = 0;
    var MinDistance = Number.MAX_VALUE;
    var GetWeight = (ID: number) => OwnerWeights![ID];
    // Create the links
    for (var I = 0; I < Nodes.length; I++) {
        var Source = Nodes[I];
        // Find potential links
        var Potentials = new Set<number>();
        FindMinimumIndexes(Dataset.Distances[I], Parameter.ClosestNeighbors + 1).forEach((Index) => Potentials.add(Index));
        for (var J = I + 1; J < Nodes.length; J++) {
            if (Dataset.Distances[I][J] <= Parameter.LinkMinimumDistance) Potentials.add(J);
        }
        // Create the links
        for (var J of Potentials) {
            if (I == J) continue;
            var Target = Nodes[J];
            var LinkID = [Source.ID, Target.ID].sort().join("-");
            var Distance = Dataset.Distances[I][J];
            if (Distance > Parameter.LinkMaximumDistance) continue;
            if (!Links.has(LinkID)) {
                var Link: Link<Code> = {
                    source: Source,
                    target: Target,
                    Source: Source,
                    Target: Target,
                    Distance: Distance,
                    VisualizeDistance: InverseLerp(Parameter.LinkMinimumDistance, Parameter.LinkMaximumDistance, Distance),
                };
                Link.Weight = Math.pow(1 - Link.VisualizeDistance!, 2);
                Link.VisualizeWeight = Link.Weight;
                Source.Links.push(Link);
                Target.Links.push(Link);
                Links.set(LinkID, Link);
                if (Distance <= Parameter.LinkMinimumDistance) {
                    Source.Owners.forEach((Owner) => {
                        Target.NearOwners.add(Owner);
                        Target.Weights[Owner] += 1;
                    });
                    Target.Owners.forEach((Owner) => {
                        Source.NearOwners.add(Owner);
                        Source.Weights[Owner] += 1;
                    });
                    Source.Neighbors++;
                    Target.Neighbors++;
                }
            }
            MaxDistance = Math.max(MaxDistance, Distance);
            MinDistance = Math.min(MinDistance, Distance);
        }
    }
    // Calculate the weights
    for (var I = 0; I < Nodes.length; I++) {
        var Source = Nodes[I];
        for (var Owner = 0; Owner < AllOwners; Owner++)
            Source.Weights[Owner] = Math.min(Math.max(Source.Weights[Owner] / Math.max(Source.Neighbors, 1), 0), 1);
        var RealOwners = 0;
        for (var Owner of Source.Owners) {
            if (GetWeight(Owner) > 0) RealOwners++;
            Source.Weights[Owner] = 1;
        }
        Source.Novel = RealOwners == 1;
        Source.TotalWeight = Source.Weights.reduce((A, B, I) => (I == 0 ? A : A + B * GetWeight(Owner)), 0);
    }
    // Store it
    var Graph: Graph<Code> = {
        Nodes: Nodes,
        Links: Array.from(Links.values()),
        MaximumDistance: MaxDistance,
        MinimumDistance: MinDistance,
    };
    // Identify the components
    Graph.Components = FindCommunities(Graph.Nodes, Graph.Links, (Node, Links) => {
        // Only to solve ties
        return Math.sqrt(Node.Data.Examples?.length ?? 0) * 0.001;
    });
    // Look at every link - and if the source and target are in different components, reduce the weight
    // Thus, we will have a more close spatial arrangement of the components
    var EffectiveNodes = Math.max(100, Graph.Nodes.length);
    Graph.Links.forEach((Link) => {
        if (Link.Source.Component == Link.Target.Component) {
            Link.VisualizeWeight = Link.VisualizeWeight!;
        } else {
            if (Link.Source.Links.length <= 1 || Link.Target.Links.length <= 1) return;
            if (Link.Source.Component !== undefined && Link.Target.Component !== undefined) {
                Link.VisualizeDistance = Link.VisualizeDistance! * Math.sqrt(EffectiveNodes) * 0.5;
                Link.VisualizeWeight = 0.15 * Link.VisualizeWeight! * Link.VisualizeWeight!;
            }
        }
    });
    // Then, we need to initialize nodes' positions based on components
    var CountedNodes = 0;
    var Ratios: number[] = [0];
    for (var Component of Graph.Components) {
        Ratios.push((CountedNodes + Component.Nodes.length / 2) / Graph.Nodes.length);
        CountedNodes += Component.Nodes.length;
    }
    Graph.Nodes.forEach((Node) => {
        var Ratio = Ratios[(Node.Component?.ID ?? -1) + 1];
        (Node.x = (Math.cos(Ratio * 2 * Math.PI) - 0.5 + Math.random() * 0.15) * (EffectiveNodes + 50)),
            (Node.y = (Math.sin(Ratio * 2 * Math.PI) - 0.5 + Math.random() * 0.15) * (EffectiveNodes + 50));
    });
    return Graph;
}

/** BuildConcurrenceGraph: Build a concurrence code graph from the dataset. */
export function BuildConcurrenceGraph() {}

/** FindCommunities: Find the communities in the graph. */
export function FindCommunities<T>(
    Nodes: Node<T>[],
    Links: Link<T>[],
    NodeEvaluator: (Node: Node<T>, Links: Link<T>[]) => number,
    LinkEvaluator: (Link: Link<T>) => number = (Link) => Link.Weight ?? 1,
    MinimumNodes: number = 3,
): Component<T>[] {
    // Create a graph
    var Weights = new Map<string, number>();
    var Graph = new graphology.UndirectedGraph();
    Nodes.forEach((Node) => Graph.addNode(Node.ID));
    Links.forEach((Link) => {
        var Weight = LinkEvaluator(Link);
        if (Weight > 0) Weights.set(Graph.addEdge(Link.Source.ID, Link.Target.ID), Weight);
    });
    // Find the communities
    var Communities = (graphologyLibrary.communitiesLouvain as any)(Graph, {
        getEdgeWeight: (Edge: any) => Weights.get(Edge)!,
        resolution: 1.5,
        rng: new (Math as any).seedrandom("deterministic"),
    }) as Record<string, number>;
    // Create the components
    var Components: Component<T>[] = new Array(Object.values(Communities).reduce((a, b) => Math.max(a, b), 0) + 1);
    for (var I = 0; I < Components.length; I++) Components[I] = { ID: -1, Nodes: [] };
    for (var Node of Nodes) {
        var Community = Communities[Node.ID];
        Components[Community].Nodes.push(Node);
    }
    // Find the representatives
    for (var Component of Components) {
        Component.Nodes = SortNodesByCentrality(Component.Nodes, Links, NodeEvaluator, LinkEvaluator);
        Component.Representative = Component.Nodes[0];
    }
    // Filter the components
    var Components = Components.filter((Component) => Component.Nodes.length >= MinimumNodes);
    Components.forEach((Component, Index) => {
        Component.ID = Index;
        Component.Nodes.forEach((Node) => (Node.Component = Component));
    });
    // Sort the components
    var ComponentWeights = Components.map((Component) => Component.Nodes.reduce((A, B) => A + B.TotalWeight, 0));
    Components.sort((A, B) => ComponentWeights[B.ID] - ComponentWeights[A.ID]);
    return Components;
}

/** SortNodesByCentrality: Sort nodes by their relative centrality. */
export function SortNodesByCentrality<T>(
    Nodes: Node<T>[],
    Links: Link<T>[],
    NodeEvaluator: (Node: Node<T>, Links: Link<T>[]) => number,
    LinkEvaluator: (Link: Link<T>) => number = (Link) => Link.Weight ?? 1,
): Node<T>[] {
    // Create a graph
    var Weights = new Map<string, number>();
    var Graph = new graphology.UndirectedGraph();
    Nodes.forEach((Node) => Graph.addNode(Node.ID));
    Links.filter((Link) => Nodes.includes(Link.Source) && Nodes.includes(Link.Target)).forEach((Link) => {
        var Weight = LinkEvaluator(Link);
        if (Weight > 0) Weights.set(Graph.addEdge(Link.Source.ID, Link.Target.ID), Weight);
    });
    // Find the central node
    var Result = graphologyLibrary.metrics.centrality.pagerank(Graph, {
        getEdgeWeight: (Edge: any) => Weights.get(Edge)!,
    });
    // Translate the result
    for (var Node of Nodes) {
        Result[Node.ID] = Result[Node.ID]! * Node.TotalWeight + NodeEvaluator(Node, Links);
    }
    return Nodes.sort((A, B) => Result[B.ID] - Result[A.ID]);
}

/** FilterNodeByOwner: Filter a node by presence of the owner. */
export function FilterNodeByOwner<T>(Node: Node<T>, Owner: number, NearOwners: boolean): boolean {
    return NearOwners ? Node.NearOwners.has(Owner) : Node.Owners.has(Owner);
}

/** FilterNodeByOwners: Filter a node by presence of some owners. */
export function FilterNodeByOwners<T>(Node: Node<T>, Owners: number[], NearOwners: boolean): boolean {
    return Owners.some((Owner) => FilterNodeByOwner(Node, Owner, NearOwners));
}

/** FilterNodeByOwners: Filter nodes by presence of the owner. */
export function FilterNodesByOwner<T>(Nodes: Node<T>[], Owner: number, NearOwners: boolean): Node<T>[] {
    return Nodes.filter((Node) => FilterNodeByOwner(Node, Owner, NearOwners));
}

/** FilterNodeByExample: Filter a node by presence of any examples. */
export function FilterNodeByExample<T extends Code>(Node: Node<T>, IDs: string[]): boolean {
    return FilterCodeByExample(Node.Data, IDs);
}

/** FilterCodeByExample: Filter a code by presence of any examples. */
export function FilterCodeByExample<T extends Code>(Code: T, IDs: string[]): boolean {
    return (
        Code.Examples?.some((Example) => {
            return IDs.some((ID) => Example == ID || Example.startsWith(ID + "|||"));
        }) ?? false
    );
}

/** FilterItemByUser: Filter items by user ID. */
export function FilterItemByUser(Dataset: Dataset<DataChunk<DataItem>>, Parameters: string[]): DataItem[] {
    return Array.from(
        new Set(
            Object.values(Dataset.Data)
                .flatMap((Chunk) => Object.entries(Chunk))
                .flatMap(([Key, Value]) => Value.AllItems ?? [])
                .filter((Item) => Parameters.includes(Item.UserID))
        ),
    );
}

/** FindMinimumIndexes: Find the indices of the minimum k elements in an array. */
function FindMinimumIndexes(arr: number[], k: number): number[] {
    // Create an array of indices [0, 1, 2, ..., arr.length - 1].
    const indices = arr.map((value, index) => index);
    // Sort the indices array based on the values at these indices in the original array.
    indices.sort((a, b) => arr[a] - arr[b]);
    // Return the first k indices.
    return indices.slice(0, k);
}
