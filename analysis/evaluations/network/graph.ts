import { Code, CodebookComparison } from "../../../utils/schema.js";
import { Node, Link, Graph, Component } from './schema.js';

/** Parameters: The parameters for the visualizer. */
export class Parameters {
    /** LinkMinimumDistance: The minimum distance to create links between codes. */
    public LinkMinimumDistance: number = 0.65;
    /** LinkMaximumDistance: The maximum distance to create links between codes. */
    public LinkMaximumDistance: number = 0.9;
    /** LinkDistanceDisplayScale: The display scale factor for the link distances. */
    public LinkDistanceDisplayScale: number = 50;
    /** ClosestNeighbors: The number of closest neighbors to guarantee links regardless of the threshold. */
    public ClosestNeighbors: number = 3;
    /** UseNearOwners: Whether to visualize the near-owners in place of owners. */
    public UseNearOwners: boolean = true;
}

/** BuildSemanticGraph: Build a semantic code graph from the dataset. */
export function BuildSemanticGraph(Dataset: CodebookComparison, Parameter: Parameters = new Parameters()): Graph<Code> {
    var Nodes: Node<Code>[] =
        Dataset.Codes.map((Code, Index) => ({ Type: "Code", ID: Index.toString(), Data: Code, NearOwners: new Set(Code.Owners), x: Code.Position![0], y: Code.Position![1] }));
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
                Links.set(LinkID, { 
                    source: Source, target: Target, 
                    Source: Source, Target: Target, 
                    Distance: Distance, });
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
    var Graph = { Nodes: Nodes, Links: Array.from(Links.values()), MaximumDistance: MaxDistance, MinimumDistance: MinDistance };
    IdentifyComponents(Graph.Nodes, Graph.Links, (Node, Links) => {
        return Node.Data.Examples?.length ?? 0 + Node.NearOwners?.size ?? 0 + Links.length;
    }, (Link) => Link.Distance < Parameter.LinkMinimumDistance);
    return Graph;
}

/** IdentifyComponents: Identify the connected components in the graph. */
export function IdentifyComponents<T>
    (Nodes: Node<T>[], Links: Link<T>[], 
    NodeEvaluator: (Node: Node<T>, Links: Link<T>[]) => number,
    LinkEvaluator: (Link: Link<T>) => boolean, 
    MinimumNodes: number = 3): Component<T>[] {
    var Components: Component<T>[] = [];
    var Visited = new Set<Node<T>>();
    for (var Node of Nodes) {
        if (Visited.has(Node)) continue;
        var Queue = [Node];
        var Component = { Name: "", Nodes: new Set<Node<T>>() };
        // Find the best node - most connected and with most examples
        var BestNode: Node<T> | null = null;
        var BestNodeScore = -1;
        // Search through links
        while (Queue.length > 0) {
            var Current = Queue.shift()!;
            // Add the current node to the component
            if (Visited.has(Current)) continue;
            Visited.add(Current);
            Component.Nodes.add(Current);
            // Add the current node's neighbors to the queue
            var Degrees = 0;
            var CurrentLinks = Links.filter(LinkEvaluator)
            CurrentLinks.forEach(Link => {
                if (Link.Source == Current) {
                    Queue.push(Link.Target);
                    Degrees++;
                }
                if (Link.Target == Current) {
                    Queue.push(Link.Source);
                    Degrees++;
                }
            });
            // Update the most connected node
            var Score = NodeEvaluator(Current, CurrentLinks);
            if (Score > BestNodeScore) {
                BestNodeScore = Score;
                BestNode = Current;
            }
        }
        if (Component.Nodes.size < MinimumNodes) continue;
        // Assign the name
        if (BestNode)
            Component.Name = (BestNode.Data as any).Label;
        Components.push(Component);
    }
    return Components;
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