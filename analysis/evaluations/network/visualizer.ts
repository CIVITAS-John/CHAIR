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
    /** LinkLayer: The layer for the links. */
    private LinkLayer: d3.Selection<SVGGElement, unknown, null, undefined>;
    /** NodeLayer: The layer for the nodes. */
    private NodeLayer: d3.Selection<SVGGElement, unknown, null, undefined>;
    /** LabelLayer: The layer for the labels. */
    private LabelLayer: d3.Selection<SVGGElement, unknown, null, undefined>;
    /** Zoom: The zoom behavior in-use. */
    private Zoom: d3.ZoomBehavior<globalThis.Element, unknown>;
    /** Dataset: The underlying dataset. */
    private Dataset: CodebookComparison = {} as any;
    /** Parameters: The parameters for the visualizer. */
    private Parameters: Parameters = new Parameters();
    /** Constructor: Constructing the manager. */
    public constructor(Container: Cash) {
        // Initialize the SVG
        var Root = d3.select(Container.get(0)!)
            .attr("style", `background-color: ${d3.interpolateViridis(0)}`);
        this.Container = Root.append("svg");
        this.LinkLayer = this.Container.append("g").attr("class", "links");
        this.NodeLayer = this.Container.append("g").attr("class", "nodes");
        this.LabelLayer = this.Container.append("g").attr("class", "labels");
        // Zoom support
        this.Zoom = d3.zoom().scaleExtent([.6, 6]).on("zoom", (event) => {
            this.Container.attr("transform", event.transform);
        }) as any;
        Root.call(this.Zoom as any);
        this.Zoom.scaleTo(this.Container as any, 1);
        // Load the data
        d3.json("network.json").then((Data) => {
            this.Dataset = Data as any;
            this.BuildCodeGraph();
            this.GenerateLayout(this.CodeGraph, (Alpha) => this.RenderCodes(Alpha));
        });
    }
    /** CodeGraph: The coding graph. */
    private CodeGraph: Graph<Code> = { Nodes: [], Links: [], MaxDistance: 0, MinDistance: 0 };
    /** BuildCodeGraph: Build the coding graph from the dataset. */
    public BuildCodeGraph() {
        var Nodes: Node<Code>[] = 
            this.Dataset.Codes.map((Code) => ({ ID: Code.Label, Data: Code, NearOwners: new Set(Code.Owners), x: Code.Position![0], y: Code.Position![1] }));
        var Links: Map<string, Link<Code>> = new Map();
        var MaxDistance = 0;
        var MinDistance = Number.MAX_VALUE;
        // Find the links
        for (var I = 0; I < Nodes.length; I++) {
            var Source = Nodes[I];
            var Potentials = new Set<number>();
            FindMinimumIndexes(this.Dataset.Distances[I], 
                this.Parameters.ClosestNeighbors + 1).forEach((Index) => Potentials.add(Index));
            for (var J = I + 1; J < Nodes.length; J++) {
                if (this.Dataset.Distances[I][J] < this.Parameters.LinkMinimumDistance)
                    Potentials.add(J);
            }
            for (var J of Potentials) {
                if (I == J) continue;
                var Target = Nodes[J];
                var LinkID = [Source.ID, Target.ID].sort().join("-");
                var Distance = this.Dataset.Distances[I][J];
                if (Distance > this.Parameters.LinkMaximumDistance) continue;
                if (!Links.has(LinkID)) {
                    Links.set(LinkID, { 
                        source: Source, target: Target, 
                        Source: Source, Target: Target, 
                        Distance: Distance });
                    if (Distance < this.Parameters.LinkMinimumDistance) {
                        Source.Data.Owners?.forEach(Owner => Target.NearOwners.add(Owner));
                        Target.Data.Owners?.forEach(Owner => Source.NearOwners.add(Owner));
                    }
                }
                MaxDistance = Math.max(MaxDistance, Distance);
                MinDistance = Math.min(MinDistance, Distance);
            }
        }
        // Filter the nodes and links

        // Store it
        this.CodeGraph = { Nodes: Nodes, Links: Array.from(Links.values()), MaxDistance: MaxDistance, MinDistance: MinDistance };
    }
    /** RenderCodes: Render the coding graph to the container. */
    public RenderCodes(Alpha: number) {
        if (Alpha <= 0.001) return;
        var GetSize = (Node: Node<Code>) => 0.5 * (Math.sqrt(Node.Data.Examples?.length ?? 1));
        // Basic settings
        this.Container.attr("viewBox", "0 0 200 200");
        // this.Container.attr("width", 200).attr("height", 200);
        this.Zoom.extent([[0, 0], [200, 200]]);
        // Render nodes
        var AllNodes = this.NodeLayer.selectAll("circle").data(this.CodeGraph.Nodes);
        AllNodes.exit().remove();
        AllNodes.join((Enter) => 
            Enter.append("circle")
                 .attr("label", (Node) => Node.Data.Label), 
            (Update) => Update)
            // Set the fill color based on the number of owners
            .attr("fill", (Node) => d3.interpolateViridis
                ((this.Parameters.UseNearOwners ? Node.NearOwners.size : Node.Data.Owners!.length) / this.Dataset.Codebooks.length))
            // Set the radius based on the number of examples
            .attr("r", GetSize)
            .attr("cx", (Node) => Node.x!)
            .attr("cy", (Node) => Node.y!);
        // Render labels
        var AllLabels = this.LabelLayer.selectAll("text").data(this.CodeGraph.Nodes);
        AllLabels.exit().remove();
        if (Alpha <= 0.3) {
            AllLabels.join((Enter) => 
                Enter.append("text")
                    .text((Node) => Node.Data.Label)
                    .attr("fill", "white")
                    .attr("font-size", 1), (Update) => Update)
                .attr("x", (Node) => Node.x! + GetSize(Node) + 0.25)
                .attr("y", (Node) => Node.y! + 0.27);
        }
        // Render links
        var DistanceLerp = d3.scaleSequential().clamp(true)
            .domain([this.CodeGraph.MaxDistance, this.CodeGraph.MinDistance]);
        var DistanceColor = d3.scaleSequential().clamp(true)
            .domain([this.CodeGraph.MaxDistance, this.CodeGraph.MinDistance])
            .interpolator(d3.interpolateViridis);
        var AllLinks = this.LinkLayer.selectAll("line").data(this.CodeGraph.Links)
        AllLinks.exit().remove();
        AllLinks.join((Enter) => 
            Enter.append("line")
                 .attr("stroke-width", 0.2)
                 // Color the links based on the distance
                 .attr("stroke", (Link) => DistanceColor(Link.Distance))
                 .attr("stroke-opacity", 0.3)
                 .attr("distance", (Link) => Link.Distance)
                 .attr("interpolated", (Link) => DistanceLerp(Link.Distance)),
                (Update) => Update)
            .attr("x1", (Link) => Link.Source.x!)
            .attr("y1", (Link) => Link.Source.y!)
            .attr("x2", (Link) => Link.Target.x!)
            .attr("y2", (Link) => Link.Target.y!);
    }
    /** Simulation: The force simulation in-use. */
    private Simulation?: d3.Simulation<d3.SimulationNodeDatum, undefined>;
    /** GenerateLayout: Generate the network layout using a force-based simulation.  */
    public GenerateLayout<T>(Graph: Graph<T>, Renderer: (Alpha: number) => void) {
        this.Simulation = d3.forceSimulation();
        var ForceLink = d3.forceLink();
        this.Simulation.nodes(Graph.Nodes)
            .force("expel", d3.forceManyBody().distanceMin(3).distanceMax(10))
            .force("link", ForceLink.links(Graph.Links)
                .id((Node) => Node.index!)
                .distance((Link) => Math.pow((Link as any).Distance, 3) * this.Parameters.LinkDistanceDisplayScale).strength(1))
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
    public LinkDistanceDisplayScale: number = 50;
    /** ClosestNeighbors: The number of closest neighbors to guarantee links regardless of the threshold. */
    public ClosestNeighbors: number = 3;
    /** UseNearOwners: Whether to visualize the near-owners in place of owners. */
    public UseNearOwners: boolean = true;
}

/** Graph: A graph. */
export interface Graph<T> {
    /** Nodes: The nodes in the graph. */
    Nodes: Node<T>[];
    /** Links: The links in the graph. */
    Links: Link<T>[];
    /** MaxDistance: The maximum distance in the graph. */
    MaxDistance: number;
    /** MinDistance: The minimum distance in the graph. */
    MinDistance: number;
}

/** Node: A node in the graph. */
export interface Node<T> extends d3.SimulationNodeDatum {
    /** ID: The unique identifier of the node. */
    ID: string;
    /** Data: The data associated with the node. */
    Data: T;
    /** NearOwners: Owners that own at least a close neighbor nodes to this node. */
    NearOwners: Set<number>;
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