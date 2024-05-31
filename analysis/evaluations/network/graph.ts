import { Code, CodebookComparison } from "../../../utils/schema.js";
import { Node, Link, Graph, Component } from './schema.js';
import * as graphology from 'graphology';
import * as graphologyLibrary from 'graphology-library';

/** Parameters: The parameters for the visualizer. */
export class Parameters {
    // For the semantic graph
    /** LinkMinimumDistance: The minimum distance to create links between codes. */
    public LinkMinimumDistance: number = 0.65;
    /** LinkMaximumDistance: The maximum distance to create links between codes. */
    public LinkMaximumDistance: number = 0.9;
    /** ClosestNeighbors: The number of closest neighbors to guarantee links regardless of the threshold. */
    public ClosestNeighbors: number = 3;
    /** UseNearOwners: Whether to visualize the near-owners in place of owners. */
    public UseNearOwners: boolean = true;
}

/** BuildSemanticGraph: Build a semantic code graph from the dataset. */
export function BuildSemanticGraph(Dataset: CodebookComparison, Parameter: Parameters = new Parameters()): Graph<Code> {
    var Nodes: Node<Code>[] =
        Dataset.Codes.map((Code, Index) => ({ 
            Type: "Code", ID: Index.toString(), Data: Code, Links: [],
            Owners: new Set(Code.Owners), NearOwners: new Set(Code.Owners), 
            Size: Math.sqrt(Code.Examples?.length ?? 1),
            x: 0, y: 0 })); // x: Code.Position![0], y: Code.Position![1]
    var Links: Map<string, Link<Code>> = new Map();
    var MaxDistance = 0;
    var MinDistance = Number.MAX_VALUE;
    // Find the links
    for (var I = 0; I < Nodes.length; I++) {
        var Source = Nodes[I];
        var Potentials = new Set<number>();
        FindMinimumIndexes(Dataset.Distances[I], 
            Parameter.ClosestNeighbors + 1).forEach((Index) => Potentials.add(Index));
        for (var J = I + 1; J < Nodes.length; J++) {
            if (Dataset.Distances[I][J] < Parameter.LinkMinimumDistance)
                Potentials.add(J);
        }
        for (var J of Potentials) {
            if (I == J) continue;
            var Target = Nodes[J];
            var LinkID = [Source.ID, Target.ID].sort().join("-");
            var Distance = Dataset.Distances[I][J];
            if (Distance > Parameter.LinkMaximumDistance) continue;
            if (!Links.has(LinkID)) {
                var Link: Link<Code> = { 
                    source: Source, target: Target, 
                    Source: Source, Target: Target, 
                    Distance: Distance, 
                    VisualizeDistance: InverseLerp(Parameter.LinkMinimumDistance, Parameter.LinkMaximumDistance, Distance) };
                Link.Weight = Math.pow(1 - Link.VisualizeDistance!, 2);
                Link.VisualizeWeight = Link.Weight;
                Source.Links.push(Link);
                Target.Links.push(Link);
                Links.set(LinkID, Link);
                if (Distance < Parameter.LinkMinimumDistance) {
                    Source.Data.Owners?.forEach(Owner => Target.NearOwners.add(Owner));
                    Target.Data.Owners?.forEach(Owner => Source.NearOwners.add(Owner));
                }
            }
            MaxDistance = Math.max(MaxDistance, Distance);
            MinDistance = Math.min(MinDistance, Distance);
        }
    }
    // Store it
    var Graph: Graph<Code> = { 
        Nodes: Nodes, 
        Links: Array.from(Links.values()), 
        MaximumDistance: MaxDistance, 
        MinimumDistance: MinDistance };
    // Identify the components
    Graph.Components = FindCommunities(Graph.Nodes, Graph.Links, (Node, Links) => {
        return Node.Data.Examples?.length ?? 0 + 
            2 * (Node.NearOwners?.size ?? 0) + 
            10 * Links.reduce((Sum, Link) => Sum + (Link.Weight ?? 1), 0) + 
            0.2 * Node.Data.Label.length;
    });
    // Look at every link - and if the source and target are in different components, reduce the weight
    // Thus, we will have a more close spatial arrangement of the components
    Graph.Links.forEach(Link => {
        if (Link.Source.Component == Link.Target.Component) {
            Link.VisualizeWeight = Link.VisualizeWeight!;
        } else {
            if (Link.Source.Links.length <= 1 || Link.Target.Links.length <= 1) return;
            if (Link.Source.Component !== undefined && Link.Target.Component !== undefined) {
                Link.VisualizeDistance = Link.VisualizeDistance! * 10;
                Link.VisualizeWeight = 0.2 * Link.VisualizeWeight! * Link.VisualizeWeight!;
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
    Graph.Nodes.forEach(Node => {
        var Ratio = Ratios[(Node.Component?.ID ?? -1) + 1];
        Node.x = (Math.cos(Ratio * 2 * Math.PI) - 0.5 + Math.random() * 0.15) * 300,
        Node.y = (Math.sin(Ratio * 2 * Math.PI) - 0.5 + Math.random() * 0.15) * 300
    });
    return Graph;
}

/** Lerp: Linearly interpolate between two values. */
export function InverseLerp(a: number, b: number, t: number): number {
    return Math.min(1, Math.max(0, (t - a) / (b - a)));
}

/** IdentifyComponents: Identify the connected components in the graph. */
export function IdentifyComponents<T>
    (Nodes: Node<T>[], Links: Link<T>[], 
    NodeEvaluator: (Node: Node<T>, Links: Link<T>[]) => number,
    LinkEvaluator: (Link: Link<T>) => number = (Link) => Link.Weight ?? 1, 
    MinimumNodes: number = 3,
    MaximumNodes: number = Math.ceil(Nodes.length / 5)): Component<T>[] {
    var Components: Component<T>[] = [];
    var Visited = new Set<Node<T>>();
    Links = Links.filter((Link) => LinkEvaluator(Link) > 0)
    for (var Node of Nodes) {
        if (Visited.has(Node)) continue;
        var Queue = [Node];
        var CurrentNodes = new Set<Node<T>>()
        // Search through links
        while (Queue.length > 0) {
            var Current = Queue.shift()!;
            if (Visited.has(Current)) continue;
            // Add the current node to the component
            Visited.add(Current);
            CurrentNodes.add(Current);
            // Add the current node's neighbors to the queue
            var Degrees = 0;
            Links.forEach(Link => {
                if (Link.Source == Current) {
                    Queue.push(Link.Target);
                    Degrees++;
                }
                if (Link.Target == Current) {
                    Queue.push(Link.Source);
                    Degrees++;
                }
            });
        }
        if (CurrentNodes.size < MinimumNodes) continue;
        var CurrentLinks = Links.filter(Link => CurrentNodes.has(Link.Source) || CurrentNodes.has(Link.Target));
        if (CurrentNodes.size > MaximumNodes)
            Components.push(...FindCommunities(Array.from(CurrentNodes), CurrentLinks, NodeEvaluator, LinkEvaluator, MinimumNodes));
        else {
            var ResultNodes = Array.from(CurrentNodes);
            Components.push({ ID: -1, Representative: FindBestNode(ResultNodes, CurrentLinks, NodeEvaluator), Nodes: ResultNodes });
        }
    }
    Components.forEach((Component, Index) => Component.ID = Index);
    return Components;
}

/** FindCommunities: Find the communities in the graph. */
export function FindCommunities<T>(Nodes: Node<T>[], Links: Link<T>[], 
    NodeEvaluator: (Node: Node<T>, Links: Link<T>[]) => number,
    LinkEvaluator: (Link: Link<T>) => number = (Link) => Link.Weight ?? 1, 
    MinimumNodes: number = 3): Component<T>[] {
    // Create a graph
    var Weights = new Map<string, number>();
    var Graph = new graphology.UndirectedGraph();
    Nodes.forEach(Node => Graph.addNode(Node.ID));
    Links.forEach(Link => { 
        var Weight = LinkEvaluator(Link);
        if (Weight > 0)
            Weights.set(Graph.addEdge(Link.Source.ID, Link.Target.ID), Weight);
    });
    // Find the communities
    var Communities = (graphologyLibrary.communitiesLouvain as any)(Graph, {
        getEdgeWeight: (Edge: any) => Weights.get(Edge)!,
        resolution: 1
    }) as Record<string, number>;
    // Create the components
    var Components: Component<T>[] = new Array(Object.values(Communities).reduce((a, b) => Math.max(a, b), 0) + 1);
    for (var I = 0; I < Components.length; I++) 
        Components[I] = { ID: -1, Nodes: [] };
    for (var Node of Nodes) {
        var Community = Communities[Node.ID];
        Components[Community].Nodes.push(Node);
    }
    // Find the representatives
    for (var Component of Components) 
        Component.Representative = FindBestNode(Component.Nodes, Links, NodeEvaluator);
    // Filter the components
    var Components = Components.filter(Component => Component.Nodes.length >= MinimumNodes);
    Components.forEach((Component, Index) => {
        Component.ID = Index;
        Component.Nodes.forEach(Node => Node.Component = Component);
    });
    return Components;
}

/** FindBestNode: Find the best node in the set. */
export function FindBestNode<T>(Nodes:Node<T>[], Links: Link<T>[], NodeEvaluator: (Node: Node<T>, Links: Link<T>[]) => number): Node<T> {
    var Best: Node<T> | undefined = undefined;
    var BestValue = Number.MIN_VALUE;
    for (var Node of Nodes) {
        var Value = NodeEvaluator(Node, Links.filter(Link => Node == Link.Source || Node == Link.Target));
        if (Value > BestValue) {
            Best = Node;
            BestValue = Value;
        }
    }
    return Best!;
}

/** FilterNodeByOwner: Filter a node by presence of the owner. */
export function FilterNodeByOwner<T>(Node: Node<T>, Owner: number, NearOwners: boolean): boolean {
    return NearOwners ? Node.NearOwners.has(Owner) : Node.Owners.has(Owner);
}

/** BuildConcurrenceGraph: Build a concurrence code graph from the dataset. */
export function BuildConcurrenceGraph() {

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