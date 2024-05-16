import * as d3 from 'd3';
import { Code, CodebookComparison } from '../../../utils/schema.js';
import type { Cash, CashStatic, Element } from 'cash-dom';
declare global {
    var $: typeof Cash.prototype.init & CashStatic;
}

/** Visualizer: The visualization manager. */
export default class Visualizer {
    /** Container: The container for the visualization. */
    private Container: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    /** Dataset: The underlying dataset. */
    private Dataset: CodebookComparison = {} as any;
    /** Parameters: The parameters for the visualizer. */
    private Parameters: Parameters = new Parameters();
    /** Constructor: Constructing the manager. */
    public constructor(Container: Cash) {
        this.Container = d3.select(Container.get(0)!).append("svg");
        d3.json("network.json").then((Data) => {
            this.Dataset = Data as any;
            this.BuildCodeGraph();
            this.GenerateLayout(this.CodeGraph, (Alpha) => this.RenderCodes(Alpha));
        });
    }
    /** CodeGraph: The coding graph. */
    private CodeGraph: Graph<Code> = { Nodes: [], Links: [] };
    /** BuildCodeGraph: Build the coding graph from the dataset. */
    public BuildCodeGraph() {
        var Nodes: Node<Code>[] = 
            this.Dataset.Codes.map((Code) => ({ ID: Code.Label, Data: Code, x: Code.Position![0], y: Code.Position![1] }));
        var Links: Map<string, Link<Code>> = new Map();
        // Find the links
        for (var I = 0; I < Nodes.length; I++) {
            var Potentials = new Set<number>();
            FindMinimumIndexes(this.Dataset.Distances[I], 
                this.Parameters.ClosestNeighbors + 1).forEach((Index) => Potentials.add(Index));
            for (var J = I + 1; J < Nodes.length; J++) {
                if (this.Dataset.Distances[I][J] < this.Parameters.LinkMinimumDistance)
                    Potentials.add(J);
            }
            for (var J of Potentials) {
                if (I == J) continue;
                var Source = Nodes[I];
                var Target = Nodes[J];
                var LinkID = [Source.ID, Target.ID].sort().join("-");
                var Distance = this.Dataset.Distances[I][J];
                if (Distance > this.Parameters.LinkMaximumDistance) continue;
                if (!Links.has(LinkID))
                    Links.set(LinkID, { 
                        source: Source, target: Target, 
                        Source: Source, Target: Target, 
                        Distance: Distance });
            }
        }
        // Filter the nodes and links

        // Store it
        this.CodeGraph = { Nodes: Nodes, Links: Array.from(Links.values()) };
    }
    /** RenderCodes: Render the coding graph to the container. */
    public RenderCodes(Alpha: number) {
        console.log(Alpha);
        var GetSize = (Node: Node<Code>) => Math.sqrt(Node.Data.Examples?.length ?? 1);
        // Render nodes
        this.Container.attr("viewBox", "-100 -100 200 200")
            .selectAll("circle").data(this.CodeGraph.Nodes)
            .enter()
            .append("circle")
            .attr("r", GetSize)
            .attr("cx", (Node) => Node.x!)
            .attr("cy", (Node) => Node.y!);
        // Render labels
        // if (Alpha <= 0.3) {
            this.Container.selectAll("text").data(this.CodeGraph.Nodes)
                .enter()
                .append("text")
                .attr("x", (Node) => Node.x! + GetSize(Node) + 0.2)
                .attr("y", (Node) => Node.y!)
                .text((Node) => Node.Data.Label)
                .attr("font-size", 1)
                .attr("text-anchor", "start")
                .attr("alignment-baseline", "middle");
        // }
        // Render links
        var DistanceColor = d3.scaleSequential()
            .domain([0, this.Parameters.LinkMaximumDistance])
            .interpolator(d3.interpolateViridis);
        this.Container.selectAll("line").data(this.CodeGraph.Links)
            .enter()
            .append("line")
            .attr("x1", (Link) => Link.Source.x!)
            .attr("y1", (Link) => Link.Source.y!)
            .attr("x2", (Link) => Link.Target.x!)
            .attr("y2", (Link) => Link.Target.y!)
            .attr("stroke", (Link) => DistanceColor(Link.Distance))
            .attr("stroke-width", 0.1);
    }
    /** Simulation: The force simulation in-use. */
    private Simulation?: d3.Simulation<d3.SimulationNodeDatum, undefined>;
    /** GenerateLayout: Generate the network layout using a force-based simulation.  */
    public GenerateLayout<T>(Graph: Graph<T>, Renderer: (Alpha: number) => void) {
        this.Simulation = d3.forceSimulation();
        var ForceLink = d3.forceLink();
        this.Simulation.nodes(Graph.Nodes)
            .force("expel", d3.forceManyBody().distanceMin(2).distanceMax(20))
            .force("link", ForceLink.links(Graph.Links)
                .id((Node) => Node.index!)
                .distance((Link) => (Link as any).Distance * this.Parameters.LinkDistanceDisplayScale))
            .force("center", d3.forceCenter())
            .on("tick", () => Renderer(this.Simulation!.alpha()));
        this.Simulation.alpha(1).alphaTarget(0).restart();
    }
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

/** Parameters: The parameters for the visualizer. */
export class Parameters {
    /** LinkMinimumDistance: The minimum distance to create links between codes. */
    public LinkMinimumDistance: number = 0.7;
    /** LinkMaximumDistance: The maximum distance to create links between codes. */
    public LinkMaximumDistance: number = 1;
    /** LinkDistanceDisplayScale: The display scale factor for the link distances. */
    public LinkDistanceDisplayScale: number = 5;
    /** ClosestNeighbors: The number of closest neighbors to guarantee links regardless of the threshold. */
    public ClosestNeighbors: number = 3;
}

/** Graph: A graph. */
export interface Graph<T> {
    /** Nodes: The nodes in the graph. */
    Nodes: Node<T>[];
    /** Links: The links in the graph. */
    Links: Link<T>[];
}

/** Node: A node in the graph. */
export interface Node<T> extends d3.SimulationNodeDatum {
    /** ID: The unique identifier of the node. */
    ID: string;
    /** Data: The data associated with the node. */
    Data: T;
}

/** Link: A link between two nodes in the graph. */
export interface Link<T> extends d3.SimulationLinkDatum<Node<T>> {
    /** Source: The source node. */
    Source: Node<T>;
    /** Target: The target node. */
    Target: Node<T>;
    /** Distance: The desired distance of the link. */
    Distance: number;
}