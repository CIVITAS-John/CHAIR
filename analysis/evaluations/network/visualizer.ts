import * as d3 from 'd3';
import { Code, CodebookComparison } from '../../../utils/schema.js';
import { Node, Link, Graph, Component } from './schema.js';
import { Parameters, BuildSemanticGraph } from './graph.js';
import type { Cash, CashStatic, Element } from 'cash-dom';
declare global {
    var $: typeof Cash.prototype.init & CashStatic;
}

/** Visualizer: The visualization manager. */
export class Visualizer {
    /** Container: The container for the visualization. */
    private Container: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    /** LinkLayer: The layer for the links. */
    private LinkLayer: d3.Selection<SVGGElement, unknown, null, undefined>;
    /** NodeLayer: The layer for the nodes. */
    private NodeLayer: d3.Selection<SVGGElement, unknown, null, undefined>;
    /** LabelLayer: The layer for the labels. */
    private LabelLayer: d3.Selection<SVGGElement, unknown, null, undefined>;
    /** ComponentLayer: The layer for the components. */
    private ComponentLayer: d3.Selection<SVGGElement, unknown, null, undefined>;
    /** Zoom: The zoom behavior in-use. */
    private Zoom: d3.ZoomBehavior<globalThis.Element, unknown>;
    /** Dataset: The underlying dataset. */
    public Dataset: CodebookComparison = {} as any;
    /** Parameters: The parameters for the visualizer. */
    public Parameters: Parameters = new Parameters();
    /** Constructor: Constructing the manager. */
    public constructor(Container: Cash) {
        // Initialize the SVG
        var Root = d3.select(Container.get(0)!)
            .attr("style", `background-color: ${d3.interpolateViridis(0)}`);
        this.Container = Root.append("svg");
        var Scaler = this.Container.append("g");
        this.LinkLayer = Scaler.append("g").attr("class", "links");
        this.NodeLayer = Scaler.append("g").attr("class", "nodes");
        this.LabelLayer = Scaler.append("g").attr("class", "labels");
        this.ComponentLayer = Scaler.append("g").attr("class", "components");
        // Zoom support
        this.Zoom = d3.zoom().scaleExtent([1, 8]).on("zoom", (event) => {
            Scaler.attr("transform", event.transform);
            var ScaleProgress = (1 - Math.max(0, 3 - event.transform.k) / 2);
            this.LinkLayer.style("opacity", 0.1 + ScaleProgress);
            this.NodeLayer.style("opacity", 0.1 + ScaleProgress);
            this.LabelLayer.style("opacity", 0.1 + ScaleProgress);
            this.ComponentLayer.style("opacity", 2 - ScaleProgress * 2);
            this.ComponentLayer.style("display", ScaleProgress > 0.9 ? "none" : "block");
            this.ComponentLayer.style("pointer-events", ScaleProgress > 0.6 ? "none" : "all");
        }) as any;
        this.Zoom.scaleTo(this.Container as any, 1);
        this.Container.call(this.Zoom as any);
        // Load the data
        d3.json("network.json").then((Data) => {
            this.Dataset = Data as any;
            this.CodeGraph = BuildSemanticGraph(this.Dataset, this.Parameters);
            this.GenerateLayout(this.CodeGraph, (Alpha) => this.RenderCodes(Alpha));
        });
    }
    /** CodeGraph: The coding graph. */
    private CodeGraph: Graph<Code> = { Nodes: [], Links: [], MaximumDistance: 0, MinimumDistance: 0 };
    /** RenderCodes: Render the coding graph to the container. */
    public RenderCodes(Alpha: number) {
        if (Alpha <= 0.001) return;
        var GetSize = (Node: Node<Code>) => 0.5 * (Math.sqrt(Node.Data.Examples?.length ?? 1));
        // Basic settings
        this.Container.attr("viewBox", "0 0 300 300");
        // this.Container.attr("width", 200).attr("height", 200);
        this.Zoom.extent([[0, 0], [300, 300]]);
        // Render nodes
        var AllNodes = this.NodeLayer.selectAll("circle").data(this.CodeGraph.Nodes);
        AllNodes.exit().remove();
        AllNodes.join((Enter) => 
            Enter.append("circle")
                 .attr("id", (Node) => `node-${Node.ID}`)
                 .attr("label", (Node) => Node.Data.Label)
                 .on("mouseover", (Event, Node) => this.NodeOver(Event, Node))
                 .on("mouseout", (Event, Node) => this.NodeOut(Event, Node))
                 .on("click", (Event, Node) => this.NodeChosen(Event, Node)), 
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
                    .attr("id", (Node) => `label-${Node.ID}`)
                    .text((Node) => Node.Data.Label)
                    .attr("fill", "#cccccc")
                    .attr("fill-opacity", 0.7)
                    .attr("font-size", 1), (Update) => Update)
                .attr("x", (Node) => Node.x! + GetSize(Node) + 0.25)
                .attr("y", (Node) => Node.y! + 0.27);
        }
        // Render links
        var DistanceLerp = d3.scaleSequential().clamp(true)
            .domain([this.CodeGraph.MaximumDistance, this.Parameters.LinkMinimumDistance]);
        var DistanceColor = d3.scaleSequential().clamp(true)
            .domain([this.CodeGraph.MaximumDistance, this.Parameters.LinkMinimumDistance])
            .interpolator(d3.interpolateViridis);
        var AllLinks = this.LinkLayer.selectAll("line").data(this.CodeGraph.Links)
        AllLinks.exit().remove();
        AllLinks.join((Enter) => 
            Enter.append("line")
                 .attr("sourceid", (Link) => `${ Link.Source.ID }`)
                 .attr("targetid", (Link) => `${ Link.Target.ID }`)
                 .attr("stroke-width", 0.2)
                 // Color the links based on the distance
                 .attr("stroke", (Link) => DistanceColor(Link.Distance))
                 .attr("stroke-opacity", 0.2)
                 .attr("distance", (Link) => Link.Distance)
                 .attr("interpolated", (Link) => DistanceLerp(Link.Distance)),
                (Update) => Update)
            .attr("x1", (Link) => Link.Source.x!)
            .attr("y1", (Link) => Link.Source.y!)
            .attr("x2", (Link) => Link.Target.x!)
            .attr("y2", (Link) => Link.Target.y!);
        // Visualize components
        if (this.CodeGraph.Components) {
            var AllComponents = this.ComponentLayer.selectAll("text").data(this.CodeGraph.Components);
            AllComponents.exit().remove();
            AllComponents.join((Enter) => 
                Enter.append("text")
                    .text((Component) => `${Component.Representative!.Data.Label} (+${Component.Nodes.length - 1})`)
                    .attr("id", (Component) => `component-${Component.ID}`)
                    .attr("fill", "#ffffff")
                    .attr("font-size", 4), (Update) => Update)
                    .attr("text-anchor", "middle")
                    .attr("dominant-baseline", "middle")
                .attr("x", (Component) => Component.Representative!.x!)
                .attr("y", (Component) => Component.Representative!.y!)
                .on("mouseover", (Event, Component) => this.ComponentOver(Event, Component))
                .on("mouseout", (Event, Component) => this.ComponentOut(Event, Component));
                // .attr("x", (Component) => d3.mean(Component.Nodes.map(Node => Node.x!))!)
                // .attr("y", (Component) => d3.mean(Component.Nodes.map(Node => Node.y!))!);
        } else this.ComponentLayer.selectAll("text").remove();
    }
    /** ApplyFilter: Apply a filter to the visualization. */
    public ApplyFilter<T>(Filter: (Node: Node<T>) => boolean = () => true) {
    }
    // Node events
    /** NodeOver: Handle the mouse-over event on a node. */
    public NodeOver<T>(Event: Event, Node: Node<T>) {
        SetClassForNode(Node.ID, "hovering", true);
        SetClassForLinks(Node.ID, "hovering", true);
        if (!this.ChosenNodes.includes(Node))
            this.TriggerChosenCallback(Node, true);
    }
    /** NodeOut: Handle the mouse-out event on a node. */
    public NodeOut<T>(Event: Event, Node: Node<T>) {
        SetClassForNode(Node.ID, "hovering", false);
        SetClassForLinks(Node.ID, "hovering", false);
        if (!this.ChosenNodes.includes(Node))
            this.TriggerChosenCallback(Node, false);
    }
    /** ChosenNode: The currently chosen node. */
    public ChosenNodes: any[] = [];
    /** OnChosen: The callback for chosen nodes. */
    public ChosenCallbacks: Map<string, (Node: any, Status: boolean) => void> = new Map();
    /** RegisterChosenCallback: Register a callback for a certain data type. */
    public RegisterChosenCallback<T>(Name: string, Callback: (Node: Node<T>, Status: boolean) => void) {
        this.ChosenCallbacks.set(Name, Callback);
    }
    /** TriggerChosenCallback: Trigger a callback for a certain node. */
    public TriggerChosenCallback<T>(Node: Node<T>, Status: boolean) {
        var Callback = this.ChosenCallbacks.get(Node.Type);
        if (Callback) Callback(Node, Status);
    }
    /** NodeChosen: Handle the click event on a node. */
    public NodeChosen<T>(Event: Event, Node?: Node<T>, Additive: boolean = false) {
        var Incumbent = Node && this.ChosenNodes.includes(Node);
        // If no new mode, remove all
        // If there is a new mode and no shift key, remove all
        var Removal = Node == undefined || (!Additive && !Incumbent && !(Event as any).shiftKey);
        if (Removal) {
            this.ChosenNodes.forEach(Node => {
                SetClassForNode(Node.ID, "chosen", false);
                SetClassForLinks(Node.ID, "chosen-neighbor", false);
                this.TriggerChosenCallback(Node, false);
            });
            this.ChosenNodes = [];
        }
        if (Node) {
            if (!Incumbent) {
                // If there is a new mode, add it
                this.ChosenNodes.push(Node);
                SetClassForNode(Node.ID, "chosen", true);
                SetClassForLinks(Node.ID, "chosen-neighbor", true);
                this.TriggerChosenCallback(Node, true);
            } else {
                // If the node is chosen, remove it
                this.ChosenNodes.splice(this.ChosenNodes.indexOf(Node), 1);
                SetClassForNode(Node.ID, "chosen", false);
                SetClassForLinks(Node.ID, "chosen-neighbor", false);
                this.TriggerChosenCallback(Node, false);
            }
        }
        this.Container.attr("class", this.ChosenNodes.length > 0 ? "with-chosen" : "");
    }
    // Component events
    /** ComponentOver: Handle the mouse-over event on a component. */
    public ComponentOver<T>(Event: Event, Component: Component<T>) {
        SetClassForComponent(Component, "hovering", true);
    }
    /** ComponentOut: Handle the mouse-out event on a component. */
    public ComponentOut<T>(Event: Event, Component: Component<T>) {
        SetClassForComponent(Component, "hovering", false);
    }
    // Layouting
    /** Simulation: The force simulation in-use. */
    private Simulation?: d3.Simulation<d3.SimulationNodeDatum, undefined>;
    /** GenerateLayout: Generate the network layout using a force-based simulation.  */
    public GenerateLayout<T>(Graph: Graph<T>, Renderer: (Alpha: number) => void) {
        this.Simulation = d3.forceSimulation();
        var ForceLink = d3.forceLink();
        this.Simulation.nodes(Graph.Nodes)
            .force("expel", d3.forceManyBody().distanceMin(2).distanceMax(20).strength(-100))
            .force("link", ForceLink.links(Graph.Links)
                .id((Node) => Node.index!)
                .distance((Link) => Math.pow((Link as any).Distance, 3) * this.Parameters.LinkDistanceDisplayScale).strength(1))
            .on("tick", () => Renderer(this.Simulation!.alpha()));
        this.Simulation.alpha(1).alphaTarget(0).restart();
    }
    /** GetCodebookColor: Get the color of a codebook. */
    public GetCodebookColor(Number: number): string {
        if (this.Dataset.Codebooks.length <= 10)
            return d3.schemeTableau10[Number];
        else return d3.interpolateWarm(Number / this.Dataset.Codebooks.length);
    }
}

/** SetClassForComponent: Set a class for a component and its nodes. */
function SetClassForComponent<T>(Component: Component<T>, Class: string, Status: boolean) {
    $(`#component-${Component.ID}`).toggleClass(Class, Status);
    Component.Nodes.forEach(Node => SetClassForNode(Node.ID, Class, Status));
}

/** SetClassForNode: Set a class for a node and its label. */
function SetClassForNode<T>(ID: string, Class: string, Status: boolean) {
    $(`#node-${ID}`).toggleClass(Class, Status);
    $(`#label-${ID}`).toggleClass(Class, Status);
}

/** SetClassForLinks: Set a class for links and linked nodes of a node. */
function SetClassForLinks<T>(ID: string, Class: string, Status: boolean) {
    var Links = $(`line[sourceid="${ID}"]`).toggleClass(Class, Status);
    Links.each((Index, Element) => SetClassForNode($(Element).attr("targetid")!, Class, Status));
    Links = $(`line[targetid="${ID}"]`).toggleClass(Class, Status);
    Links.each((Index, Element) => SetClassForNode($(Element).attr("sourceid")!, Class, Status));
}