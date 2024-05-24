import * as d3 from 'd3';
import { Code, CodebookComparison } from '../../../utils/schema.js';
import { Node, Link, Graph, Component, GraphStatus, Colorizer } from './schema.js';
import { Parameters, BuildSemanticGraph, FilterNodeByOwner } from './graph.js';
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
    /** Legends: The legends for the visualization. */
    private Legends: Cash;
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
        this.Legends = Container.find(".legends");
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
            this.SetStatus("Code", BuildSemanticGraph(this.Dataset, this.Parameters));
        });
    }
    // Status management
    /** Status: The status of the visualization. */
    public Status: GraphStatus<any> = {} as any;
    /** StatusType: The type of the status. */
    public StatusType: string = "";
    /** SetStatus: Use a new graph for visualization. */
    public SetStatus<T>(Type: string, Graph: Graph<T>) {
        this.IncumbentFilter = undefined;
        this.Status = { Graph, ChosenNodes: []};
        this.StatusType = Type;
        this.Rerender(true);
    }
    /** GetStatus: Get the status of the visualization. */
    public GetStatus<T>(): GraphStatus<T> {
        return this.Status as GraphStatus<T>;
    }
    /** Rerender: Rerender the visualization. */
    public Rerender(Relayout: boolean = false) {
        // Apply the filter
        this.Status.Graph.Nodes.forEach(Node => {
            var Filtered = this.CurrentFilter?.(Node) ?? true;
            Node.Hidden = !Filtered;
        });
        this.Status.Graph.Links.forEach(Link => {
            if (this.CurrentFilter)
                Link.Hidden = !this.CurrentFilter(Link.Source) || !this.CurrentFilter(Link.Target);
            else Link.Hidden = false;
        });
        this.Status.Graph.Components?.forEach(Component => {
            Component.CurrentNodes = Component.Nodes.filter(Node => !Node.Hidden);
        });
        // Chose the renderer
        var Renderer = (Alpha: number) => {};
        switch (this.StatusType) {
            case "Code":
                Renderer = (Alpha) => this.RenderCodes(Alpha);
                break;
        }
        // Render the visualization
        if (Relayout)
            this.GenerateLayout(this.Status.Graph, Renderer);
        else Renderer(0.002);
    }
    // Filters
    /** IncumbentName: The name of the incumbent filter. */
    private IncumbentName: string = "";
    /** CurrentFilter: The current filter for the visualization. */
    private CurrentFilter?: (Node: Node<any>) => boolean;
    /** IncumbentFilter: The chosen permenant filter for the visualization. */
    private IncumbentFilter?: (Node: Node<any>) => boolean;
    /** CurrentColorizer: The current colorizer for nodes. */
    private CurrentColorizer?: Colorizer<any>;
    /** IncumbentColorizer: The chosen permenant colorizer for nodes. */
    private IncumbentColorizer?: Colorizer<any>;
    /** SetFilter: Set a filter for the visualization. */
    public SetFilter<T>(Incumbent: boolean, Name: string = "", 
        Filter?: (Node: Node<T>) => boolean, Colorizer?: Colorizer<T>): boolean {
        if (Incumbent) {
            if (Name == this.IncumbentName) {
                Filter = undefined;
                Colorizer = undefined;
                Name = "";
            }
            this.IncumbentName = Name;
            this.IncumbentFilter = Filter;
            this.IncumbentColorizer = Colorizer;
        }
        this.CurrentFilter = Filter ?? this.IncumbentFilter;
        this.CurrentColorizer = Colorizer ?? this.IncumbentColorizer;
        this.NodeChosen(new Event("click"), undefined);
        this.Rerender();
        return this.CurrentFilter !== undefined;
    }
    /** FilterByOwner: Filter the nodes by their owners. */
    public FilterByOwner<T>(Incumbent: boolean, Owner: number, Colorize: string = "") {
        var Filter = (Node: Node<T>) => FilterNodeByOwner(Node, Owner, this.Parameters.UseNearOwners || Colorize != "");
        Colorize = Colorize.toLowerCase();
        // Set the colorizer
        var Colorizer: Colorizer<T> | undefined;
        switch (Colorize) {
            case "coverage":
            case "density":
                var Interpolator = d3.interpolateCool;
                Colorizer = {
                    Colorize: (Node) => Interpolator(Node.Owners.has(Owner) ? 1 : Node.NearOwners.has(Owner) ? 0.55 : 0.1),
                    Examples: { 
                        "In the codebook": Interpolator(1),
                        "Has a similar concept": Interpolator(0.55),
                        "Not included": "#999999"
                    }
                };
                break;
            case "novelty":
            case "conformity":
                var Interpolator = d3.interpolatePlasma;
                Colorizer = {
                    Colorize: (Node) => {
                        var Status = 0;
                        var Novel = Node.NearOwners!.size == 1 + (Node.Owners.has(0) ? 1 : 0);
                        if (Node.NearOwners.has(Owner))
                            Status = Novel ? 1 : Node.Owners.has(Owner) ? 0.7 : 0.35;
                        return Interpolator(Status);
                    },
                    Examples: { 
                        "Novel: only in this codebook": Interpolator(1),
                        "Shared: in the codebook": Interpolator(0.7),
                        "Shared: has a similar concept": Interpolator(0.35),
                        "Not included": "#999999"
                    }
                };
                break;
        }
        // Set the filter
        return this.SetFilter(Incumbent, `owner-${Owner}-${Colorize}`, Filter, Colorizer);
    }
    /** FilterByComponent: Filter the nodes by their components. */
    public FilterByComponent<T>(Incumbent: boolean, Component: Component<T>) {
        var Filter = (Node: Node<T>) => Component.Nodes.includes(Node);
        this.SetFilter(Incumbent, `component-${Component.ID}`, Filter);
    }
    // Node events
    /** NodeOver: Handle the mouse-over event on a node. */
    private NodeOver<T>(Event: Event, Node: Node<T>) {
        SetClassForNode(Node.ID, "hovering", true);
        SetClassForLinks(Node.ID, "hovering", true);
        if (!this.GetStatus().ChosenNodes.includes(Node))
            this.TriggerChosenCallback(Node, true);
    }
    /** NodeOut: Handle the mouse-out event on a node. */
    private NodeOut<T>(Event: Event, Node: Node<T>) {
        SetClassForNode(Node.ID, "hovering", false);
        SetClassForLinks(Node.ID, "hovering", false);
        if (!this.GetStatus().ChosenNodes.includes(Node))
            this.TriggerChosenCallback(Node, false);
    }
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
        var Chosens = this.GetStatus().ChosenNodes;
        var Incumbent = Node && Chosens.includes(Node);
        // If no new mode, remove all
        // If there is a new mode and no shift key, remove all
        var Removal = Node == undefined || (!Additive && !Incumbent && !(Event as any).shiftKey);
        if (Removal) {
            Chosens.forEach(Node => {
                SetClassForNode(Node.ID, "chosen", false);
                SetClassForLinks(Node.ID, "chosen-neighbor", false);
                this.TriggerChosenCallback(Node, false);
            });
            Chosens = [];
        }
        if (Node) {
            if (!Incumbent) {
                // If there is a new mode, add it
                Chosens.push(Node);
                SetClassForNode(Node.ID, "chosen", true);
                SetClassForLinks(Node.ID, "chosen-neighbor", true);
                this.TriggerChosenCallback(Node, true);
            } else {
                // If the node is chosen, remove it
                Chosens.splice(Chosens.indexOf(Node), 1);
                SetClassForNode(Node.ID, "chosen", false);
                SetClassForLinks(Node.ID, "chosen-neighbor", false);
                this.TriggerChosenCallback(Node, false);
            }
        }
        this.GetStatus().ChosenNodes = Chosens;
        this.Container.attr("class", Chosens.length > 0 ? "with-chosen" : "");
    }
    // Component events
    /** ComponentOver: Handle the mouse-over event on a component. */
    private ComponentOver<T>(Event: Event, Component: Component<T>) {
        SetClassForComponent(Component, "hovering", true);
    }
    /** ComponentOut: Handle the mouse-out event on a component. */
    private ComponentOut<T>(Event: Event, Component: Component<T>) {
        SetClassForComponent(Component, "hovering", false);
    }
    // Rendering
    /** RenderLegends: Render the legends for the visualization. */
    private RenderLegends(Examples: Record<string, string>) {
        var Hash = JSON.stringify(Examples);
        if (this.Legends.data("hash") == Hash) return;
        this.Legends.empty().data("hash", Hash);
        for (var Example in Examples) {
            this.Legends.append(`<div class="legend">
                <svg width="20" height="20"><circle cx="10" cy="10" r="8" fill="${Examples[Example]}"/></svg>
                <span>${Example}</span>
            </div>`);
        }
    }
    /** RenderCodes: Render the coding graph to the container. */
    public RenderCodes(Alpha: number) {
        if (Alpha <= 0.001) return;
        var GetSize = (Node: Node<Code>) => 0.5 * (Math.sqrt(Node.Data.Examples?.length ?? 1));
        // Basic settings
        this.Container.attr("viewBox", "0 0 300 300");
        this.Zoom.extent([[0, 0], [300, 300]]);
        // The default colorizer
        var DefaultColorizer: Colorizer<Code> = {
            Colorize: (Node) => 
                d3.interpolateViridis((this.Parameters.UseNearOwners ? Node.NearOwners.size : Node.Owners.size) / this.Dataset.Codebooks.length),
            Examples: {}
        };
        for (var I = 2; I <= this.Dataset.Codebooks.length; I++)
            DefaultColorizer.Examples[`In${this.Parameters.UseNearOwners ? " (or near)" : ""} ${I - 1} codebooks`] = d3.interpolateViridis(I / this.Dataset.Codebooks.length);
        if (this.CurrentFilter) DefaultColorizer.Examples["Not included"] = "#999999";
        this.RenderLegends((this.CurrentColorizer ?? DefaultColorizer).Examples);
        // Render nodes
        var Graph = this.GetStatus<Code>().Graph;
        var AllNodes = this.NodeLayer.selectAll("circle").data(Graph.Nodes);
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
                .attr("fill", (Node) =>
                    (this.CurrentColorizer ?? DefaultColorizer).Colorize(Node))
                // Set the radius based on the number of examples
                .attr("r", GetSize)
                .attr("cx", (Node) => Node.x!)
                .attr("cy", (Node) => Node.y!)
                .attr("class", (Node) => Node.Hidden ? "hidden" : "");
        // Render labels
        var AllLabels = this.LabelLayer.selectAll("text").data(Graph.Nodes);
        AllLabels.exit().remove();
        if (Alpha <= 0.3) {
            AllLabels.join((Enter) => 
                Enter.append("text")
                    .attr("id", (Node) => `label-${Node.ID}`)
                    .text((Node) => Node.Data.Label)
                    .attr("fill", "#e0e0e0")
                    .attr("fill-opacity", 0.7)
                    .attr("font-size", 1), (Update) => Update)
                .attr("x", (Node) => Node.x! + GetSize(Node) + 0.25)
                .attr("y", (Node) => Node.y! + 0.27)
                .attr("class", (Node) => Node.Hidden ? "hidden" : "");
        }
        // Render links
        var DistanceLerp = d3.scaleSequential().clamp(true)
            .domain([Graph.MaximumDistance, this.Parameters.LinkMinimumDistance]);
        var DistanceColor = d3.scaleSequential().clamp(true)
            .domain([Graph.MaximumDistance, this.Parameters.LinkMinimumDistance])
            .interpolator(d3.interpolateViridis);
        var AllLinks = this.LinkLayer.selectAll("line").data(Graph.Links)
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
                .attr("y2", (Link) => Link.Target.y!)
                .attr("class", (Link) => Link.Hidden ? "hidden" : "");
        // Visualize components
        if (Graph.Components) {
            var AllComponents = this.ComponentLayer.selectAll("text").data(Graph.Components);
            AllComponents.exit().remove();
            AllComponents.join((Enter) => 
                Enter.append("text")
                    .attr("id", (Component) => `component-${Component.ID}`)
                    .attr("font-size", 4)
                    .attr("text-anchor", "middle")
                    .attr("dominant-baseline", "middle")
                    .on("mouseover", (Event, Component) => this.ComponentOver(Event, Component))
                    .on("mouseout", (Event, Component) => this.ComponentOut(Event, Component))
                    .on("click", (Event, Component) => this.FilterByComponent(true, Component)),
                (Update) => Update)
                    .text((Component) => {
                        if (Component.CurrentNodes && this.CurrentFilter)
                            return `${Component.Representative!.Data.Label} (${Component.CurrentNodes.length}/${Component.Nodes.length})`
                        else return `${Component.Representative!.Data.Label} (${Component.Nodes.length})`;
                    })
                    .attr("fill", (Component) => {
                        if (Component.CurrentNodes && this.CurrentFilter)
                            return d3.interpolateViridis(Component.CurrentNodes.length / Component.Nodes.length);
                        else return "#ffffff";
                    })
                    .attr("x", (Component) => Component.Representative!.x!)
                    .attr("y", (Component) => Component.Representative!.y!);
                // .attr("x", (Component) => d3.mean(Component.Nodes.map(Node => Node.x!))!)
                // .attr("y", (Component) => d3.mean(Component.Nodes.map(Node => Node.y!))!);
        } else this.ComponentLayer.selectAll("text").remove();
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
    Component.Nodes.forEach(Node => {
        SetClassForNode(Node.ID, Class, Status);
        SetClassForLinks(Node.ID, Class, Status);
    });
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