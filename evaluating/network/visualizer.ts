import type { Cash, CashStatic } from "cash-dom";
import * as d3 from "d3";

import type { Code, CodebookComparison, DataChunk, DataItem } from "../../utils/schema.js";

import { Dialog } from "./panels/dialog.js";
import { InfoPanel } from "./panels/info-panel.js";
import { SidePanel } from "./panels/side-panel.js";
import { Tutorial } from "./tutorial.js";
import { EvaluateCodebooks } from "./utils/evaluate.js";
import type { Colorizer, FilterBase } from "./utils/filters.js";
import { ComponentFilter, OwnerFilter } from "./utils/filters.js";
import { BuildSemanticGraph } from "./utils/graph.js";
import type { Component, Graph, GraphStatus, Link, Node } from "./utils/schema.js";
import { Parameters, PostData } from "./utils/utils.js";
declare global {
    const $: typeof Cash.prototype.init & CashStatic;
}

type ChosenCallback<T> = (Node: Node<T>, Status: boolean) => void;

/** Visualizer: The visualization manager. */
export class Visualizer {
    /** Container: The container for the visualization. */
    private Container: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    /** HullLayer: The layer for the hulls. */
    private HullLayer: d3.Selection<SVGGElement, unknown, null, undefined>;
    /** LinkLayer: The layer for the links. */
    private LinkLayer: d3.Selection<SVGGElement, unknown, null, undefined>;
    /** NodeLayer: The layer for the nodes. */
    private NodeLayer: d3.Selection<SVGGElement, unknown, null, undefined>;
    /** LabelLayer: The layer for the labels. */
    private LabelLayer: d3.Selection<SVGGElement, unknown, null, undefined>;
    /** ComponentLayer: The layer for the components. */
    private ComponentLayer: d3.Selection<SVGGElement, unknown, null, undefined>;
    /** LegendContainer: The interface container of legends. */
    private LegendContainer: Cash;
    /** FilterContainer: The interface container of filters. */
    private FilterContainer: Cash;
    /** Zoom: The zoom behavior in-use. */
    private Zoom: d3.ZoomBehavior<SVGSVGElement, unknown>;
    /** Dataset: The underlying dataset. */
    public Dataset: CodebookComparison<DataChunk<DataItem>> = {} as CodebookComparison<
        DataChunk<DataItem>
    >;
    /** Parameters: The parameters for the visualizer. */
    public Parameters: Parameters = new Parameters();
    /** InfoPanel: The information panel for the visualization. */
    public InfoPanel: InfoPanel;
    /** SidePanel: The side panel for the visualization. */
    public SidePanel: SidePanel;
    /** Dialog: Dialog for the visualization. */
    public Dialog: Dialog;
    /** Tutorial: The tutorial for the visualization. */
    public Tutorial: Tutorial;
    /** Constructor: Constructing the manager. */
    public constructor(Container: Cash) {
        window.onpopstate = (Event) => {
            this.PopState(Event);
        };
        // Other components
        this.SidePanel = new SidePanel($(".side-panel"), this);
        this.InfoPanel = new InfoPanel($(".info-panel"), this);
        this.Dialog = new Dialog($(".dialog"), this);
        this.Tutorial = new Tutorial($(".portrait-overlay"), this);
        // Initialize the SVG
        const Root = d3.select(Container.get(0)!).attr("style", "background-color: #290033");
        this.Container = Root.append("svg");
        const Scaler = this.Container.append("g");
        this.HullLayer = Scaler.append("g").attr("class", "hulls");
        this.LinkLayer = Scaler.append("g").attr("class", "links");
        this.NodeLayer = Scaler.append("g").attr("class", "nodes");
        this.LabelLayer = Scaler.append("g").attr("class", "labels");
        this.ComponentLayer = Scaler.append("g").attr("class", "components");
        this.LegendContainer = Container.find(".legends");
        this.FilterContainer = Container.find(".filters");
        // Zoom support
        this.Zoom = d3
            .zoom<SVGSVGElement, unknown>()
            .scaleExtent([1, 8])
            .on("zoom", (event: { transform: d3.ZoomTransform }) => {
                Scaler.attr("transform", event.transform.toString());
                const ScaleProgress = 1 - Math.max(0, 3 - event.transform.k) / 2;
                this.LinkLayer.style("opacity", 0.3 + ScaleProgress);
                // this.NodeLayer.style("opacity", 0.1 + ScaleProgress);
                this.LabelLayer.style("opacity", ScaleProgress);
                this.ComponentLayer.style("opacity", 2 - ScaleProgress * 2);
                this.ComponentLayer.style("display", ScaleProgress > 0.9 ? "none" : "block");
                // this.ComponentLayer.style("pointer-events", ScaleProgress > 0.6 ? "none" : "all");
            });
        this.Container.call(this.Zoom);
        // Load the data
        void d3.json("network.json").then((Data) => {
            this.Dataset = Data as CodebookComparison<DataChunk<DataItem>>;
            // Set the title
            document.title =
                this.Dataset.Title + document.title.substring(document.title.indexOf(":"));
            // Parse the date and nicknames as needed
            const Datasets = this.Dataset.Source;
            this.Dataset.UserIDToNicknames = new Map();
            for (const Dataset of Object.values(Datasets.Data)) {
                for (const Chunk of Object.values(Dataset)) {
                    for (const Item of Chunk.AllItems ?? []) {
                        Item.Time = new Date(Item.Time);
                        this.Dataset.UserIDToNicknames.set(Item.UserID, Item.Nickname);
                    }
                }
            }
            // Calculate the weights
            this.Dataset.Weights =
                this.Dataset.Weights ?? this.Dataset.Names.map((_, Index) => (Index === 0 ? 0 : 1));
            this.Dataset.TotalWeight = this.Dataset.Weights.reduce((A, B) => A + B, 0);
            // Build the default graph
            this.SetStatus("Code", BuildSemanticGraph(this.Dataset, this.Parameters));
            this.SidePanel.Show();
            // Evaluate and send back the results
            const Results = EvaluateCodebooks(this.Dataset, this.Parameters);
            void PostData("/api/report/", Results);
        });
    }
    // Status management
    /** Status: The status of the visualization. */
    public Status: GraphStatus<unknown> = {} as GraphStatus<unknown>;
    /** StatusType: The type of the status. */
    public StatusType = "";
    /** SetStatus: Use a new graph for visualization. */
    public SetStatus<T>(Type: string, Graph: Graph<T>) {
        this.PreviewFilter = undefined;
        this.Filters.clear();
        this.Status = { Graph, ChosenNodes: [] };
        this.StatusType = Type;
        this.Rerender(true);
        this.CenterCamera(0, 0, 1);
    }
    /** GetStatus: Get the status of the visualization. */
    public GetStatus<T>(): GraphStatus<T> {
        return this.Status as GraphStatus<T>;
    }
    /** Rerender: Rerender the visualization. */
    public Rerender(Relayout = false) {
        // Apply the filter
        this.Status.Graph.Nodes.forEach((Node) => {
            let Filtered = true as boolean;
            this.Filters.forEach((Filter) => (Filtered = Filtered && Filter.Filter(this, Node)));
            if (this.PreviewFilter) {
                Filtered = Filtered && this.PreviewFilter.Filter(this, Node);
            }
            Node.Hidden = !Filtered;
        });
        this.Status.Graph.Links.forEach((Link) => {
            Link.Hidden = Link.Source.Hidden ?? Link.Target.Hidden;
        });
        this.Status.Graph.Components?.forEach((Component) => {
            Component.CurrentNodes = Component.Nodes.filter((Node) => !Node.Hidden);
        });
        // Chose the renderer
        let Renderer = (_Alpha: number) => {
            // This function is intentionally left empty
        };
        switch (this.StatusType) {
            case "Code":
                Renderer = (Alpha) => {
                    this.RenderCodes(Alpha);
                };
                break;
        }
        // Render the visualization
        if (Relayout) {
            this.GenerateLayout(this.Status.Graph, Renderer);
        } else {
            Renderer(0);
        }
    }
    /** CenterCamera: Center the viewport camera to a position and scale.*/
    public CenterCamera(X: number, Y: number, Zoom: number, Animated = true) {
        if (Animated) {
            this.Container.transition()
                .duration(500)
                .call((selection) => {
                    this.Zoom.translateTo(selection, X, Y);
                })
                .transition()
                .call((selection) => {
                    this.Zoom.scaleTo(selection, Zoom);
                });
        } else {
            this.Zoom.translateTo(this.Container, X, Y);
            this.Zoom.scaleTo(this.Container, Zoom);
        }
    }
    // Filters
    /** Filters: The current filters of the graph. */
    private Filters = new Map<string, FilterBase<unknown, unknown>>();
    /** PreviewFilter: The previewing filter of the graph. */
    private PreviewFilter?: FilterBase<unknown, unknown>;
    /** SetFilter: Try to set a filter for the visualization. */
    public SetFilter<TNode, TParameter>(
        Previewing: boolean,
        Filter: FilterBase<TNode, TParameter>,
        Parameters: TParameter | undefined = undefined,
        Additive = false,
        Mode = "",
    ): boolean {
        if (Previewing) {
            if (Parameters === undefined) {
                delete this.PreviewFilter;
                Parameters = undefined;
            } else if (this.Filters.has(Filter.Name)) {
                // Do not preview something fixed
                delete this.PreviewFilter;
                Parameters = undefined;
            } else if (Filter.Name === this.PreviewFilter?.Name) {
                if (
                    !this.PreviewFilter.ToggleParameters(Parameters, Additive, Mode) &&
                    this.PreviewFilter.Parameters.length === 0
                ) {
                    delete this.PreviewFilter;
                    Parameters = undefined;
                }
            } else {
                this.PreviewFilter = Filter as FilterBase<unknown, unknown>;
                this.PreviewFilter.SetParameter([Parameters]);
                this.PreviewFilter.Mode = Mode;
            }
        } else {
            const Incumbent = this.Filters.get(Filter.Name);
            if (Parameters === undefined) {
                this.Filters.delete(Filter.Name);
                Parameters = undefined;
            } else if (Filter.Name === Incumbent?.Name) {
                if (
                    !Incumbent.ToggleParameters(Parameters, Additive, Mode) &&
                    Incumbent.Parameters.length === 0
                ) {
                    this.Filters.delete(Filter.Name);
                    Parameters = undefined;
                }
            } else {
                this.Filters.set(Filter.Name, Filter as FilterBase<unknown, unknown>);
                Filter.SetParameter([Parameters]);
                Filter.Mode = Mode;
            }
            delete this.PreviewFilter;
        }
        if (!Previewing) {
            this.NodeChosen(new MouseEvent("click"), undefined);
        }
        this.Rerender();
        if (!Previewing) {
            this.RenderFilters();
            this.SidePanel.Render();
        }
        return Parameters !== undefined;
    }
    /** GetColorizer: Get the colorizer for the visualization. */
    public GetColorizer() {
        let Colorizer = this.PreviewFilter?.GetColorizer(this);
        if (!Colorizer) {
            for (const Filter of this.Filters.values()) {
                Colorizer = Filter.GetColorizer(this);
                if (Colorizer) {
                    break;
                }
            }
        }
        if (!Colorizer) {
            Colorizer = new OwnerFilter().GetColorizer(this);
        }
        return Colorizer;
    }
    /** GetFilter: Get a filter by its name. */
    public GetFilter<TNode, TParameter>(Name: string) {
        return this.Filters.get(Name) as FilterBase<TNode, TParameter> | undefined;
    }
    /** IsFilterApplied: Check if a filter is applied. */
    public IsFilterApplied(Name: string, Parameter: unknown, Mode?: string): boolean {
        const Filter = this.Filters.get(Name);
        if (Mode && Filter?.Mode !== Mode) {
            return false;
        }
        return Filter?.Parameters.includes(Parameter) ?? false;
    }
    /** RenderFilters: Render all current filters. */
    private RenderFilters() {
        this.FilterContainer.empty();
        this.Filters.forEach((Filter) => {
            const Container = $('<div class="filter"></div>').appendTo(this.FilterContainer);
            Container.append($("<span></span>").text(`${Filter.Name}:`));
            const Names = Filter.GetParameterNames(this);
            for (let I = 0; I < Filter.Parameters.length; I++) {
                const Parameter = Filter.Parameters[I];
                const Label = Names[I];
                Container.append(
                    $('<a href="javascript:void(0)" class="parameter"></a>')
                        .text(Label)
                        .on("click", () => this.SetFilter(false, Filter, Parameter)),
                );
            }
            Container.append(
                $('<a href="javascript:void(0)" class="close"></a>')
                    .text("X")
                    .on("click", () => this.SetFilter(false, Filter)),
            );
        });
    }
    // Node events
    /** NodeOver: Handle the mouse-over event on a node. */
    public NodeOver<T>(_Event: Event, Node: Node<T>) {
        SetClassForNode(Node.ID, "hovering", true);
        SetClassForLinks(Node.ID, "hovering", true);
        if (!this.GetStatus().ChosenNodes.includes(Node)) {
            this.TriggerChosenCallback(Node, true);
        }
    }
    /** NodeOut: Handle the mouse-out event on a node. */
    public NodeOut<T>(_Event: Event, Node: Node<T>) {
        SetClassForNode(Node.ID, "hovering", false);
        SetClassForLinks(Node.ID, "hovering", false);
        if (!this.GetStatus().ChosenNodes.includes(Node)) {
            this.TriggerChosenCallback(Node, false);
        }
    }
    /** OnChosen: The callback for chosen nodes. */
    public ChosenCallbacks = new Map<string, ChosenCallback<unknown>>();
    /** RegisterChosenCallback: Register a callback for a certain data type. */
    public RegisterChosenCallback<T>(Name: string, Callback: ChosenCallback<T>) {
        this.ChosenCallbacks.set(Name, Callback as ChosenCallback<unknown>);
    }
    /** TriggerChosenCallback: Trigger a callback for a certain node. */
    public TriggerChosenCallback<T>(Node: Node<T>, Status: boolean) {
        const Callback = this.ChosenCallbacks.get(Node.Type);
        if (Callback) {
            Callback(Node, Status);
        }
    }
    /** NodeChosen: Handle the click event on a node. */
    public NodeChosen<T>(Event: MouseEvent, Node?: Node<T>, Additive = false): boolean {
        let Chosens = this.GetStatus().ChosenNodes;
        const Incumbent = Node && Chosens.includes(Node);
        // If no new mode, remove all
        // If there is a new mode and no shift key, remove all
        const Removal = Node === undefined || (!Additive && !Incumbent && !Event.shiftKey);
        if (Removal) {
            Chosens.forEach((Node) => {
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
        // Update the status
        this.GetStatus().ChosenNodes = Chosens;
        this.Container.classed("node-chosen", Chosens.length > 0);
        this.SidePanel.Render();
        return Node !== undefined && Chosens.includes(Node);
    }
    /** FocusOnNode: Focus on a node by its SVG element. */
    public FocusOnNode(Element: SVGElement) {
        const Node = d3.select(Element).datum() as Node<unknown>;
        this.CenterCamera(Node.x!, Node.y!, 3, false);
        if (!this.GetStatus().ChosenNodes.includes(Node)) {
            this.NodeChosen(new MouseEvent("click"), Node);
        }
    }
    // Component events
    /** ComponentOver: Handle the mouse-over event on a component. */
    public ComponentOver<T>(_Event: Event, Component: Component<T>) {
        SetClassForComponent(Component, "hovering", true);
    }
    /** ComponentOut: Handle the mouse-out event on a component. */
    public ComponentOut<T>(_Event: Event, Component: Component<T>) {
        SetClassForComponent(Component, "hovering", false);
    }
    /** ComponentChosen: Handle the click event on a component. */
    public ComponentChosen<T extends Code>(Event: MouseEvent, Component: Component<T>) {
        const Status = this.SetFilter(false, new ComponentFilter(), Component, Event.shiftKey);
        if (Status) {
            this.CenterCamera(
                d3.mean(Component.Nodes.map((Node) => Node.x!))!,
                d3.mean(Component.Nodes.map((Node) => Node.y!))!,
                3,
            );
        }
        SetClassForComponent(Component, "chosen", Status, false);
        this.Container.classed("component-chosen", Status);
    }
    // Rendering
    /** RenderLegends: Render the legends for the visualization. */
    private RenderLegends(Colorizer: Colorizer<unknown>) {
        // Check if the legends are up-to-date
        const Hash =
            JSON.stringify(Colorizer.Examples) +
            JSON.stringify(Object.values(Colorizer.Results!).map((Values) => Values.length));
        if (this.LegendContainer.data("hash") === Hash) {
            return;
        }
        this.LegendContainer.empty().data("hash", Hash);
        // Render the legends
        for (const Example in Colorizer.Examples) {
            const Color = Colorizer.Examples[Example];
            this.LegendContainer.append(`<div class="legend">
                <svg width="20" height="20"><circle cx="10" cy="10" r="8" fill="${Color}"/></svg>
                <span>${Example} (${Colorizer.Results?.[Color]?.length ?? 0})</span>
            </div>`);
        }
    }
    /** RenderCodes: Render the coding graph to the container. */
    public RenderCodes(Alpha: number) {
        // Basic settings
        this.Container.attr("viewBox", "0 0 300 300");
        this.Zoom.extent([
            [0, 0],
            [300, 300],
        ]);
        // Find the colorizer to use
        const Colorizer = this.GetColorizer();
        Colorizer.Results = {};
        // Render nodes
        const Graph = this.GetStatus<Code>().Graph;
        const AllNodes = this.NodeLayer.selectAll("circle").data(Graph.Nodes);
        AllNodes.exit().remove();
        AllNodes.join(
            (Enter) =>
                Enter.append("circle")
                    .attr("id", (Node) => `node-${Node.ID}`)
                    .attr("label", (Node) => Node.Data.Label)
                    .on("mouseover", (Event: Event, Node) => {
                        this.NodeOver(Event, Node);
                    })
                    .on("mouseout", (Event: Event, Node) => {
                        this.NodeOut(Event, Node);
                    })
                    .on("click", (Event: MouseEvent, Node) => this.NodeChosen(Event, Node)),
            (Update) => Update,
        )
            // Set the fill color based on the number of owners
            .attr("fill", (Node) => {
                let Color = Colorizer.Colorize(Node);
                if (Node.Hidden) {
                    Color = "#999999";
                }
                if (!Colorizer.Results![Color]) {
                    Colorizer.Results![Color] = [];
                }
                Colorizer.Results![Color].push(Node);
                return Color;
            })
            // Set the radius based on the number of examples
            .attr("r", (Node) => (Node as Node<unknown>).Size! * 0.5)
            .attr("cx", (Node) => Node.x!)
            .attr("cy", (Node) => Node.y!)
            .classed("hidden", (Node) => Node.Hidden ?? false);
        // Render legends
        this.RenderLegends(Colorizer);
        // Render labels
        const AllLabels = this.LabelLayer.selectAll("text").data(Graph.Nodes);
        AllLabels.exit().remove();
        if (Alpha <= 0.3) {
            AllLabels.join(
                (Enter) =>
                    Enter.append("text")
                        .attr("id", (Node) => `label-${Node.ID}`)
                        .text((Node) => Node.Data.Label)
                        .attr("fill", "#e0e0e0")
                        .attr("fill-opacity", 0.7)
                        .attr("font-size", 1.2),
                (Update) => Update,
            )
                .attr("x", (Node) => Node.x! + (Node as Node<unknown>).Size! * 0.5 + 0.25)
                .attr("y", (Node) => Node.y! + 0.27)
                .classed("hidden", (Node) => Node.Hidden ?? false);
        }
        // Render links
        const DistanceLerp = d3
            .scaleSequential()
            .clamp(true)
            .domain([Graph.MaximumDistance, this.Parameters.LinkMinimumDistance]);
        const DistanceColor = d3
            .scaleSequential()
            .clamp(true)
            .domain([Graph.MaximumDistance, this.Parameters.LinkMinimumDistance])
            .interpolator(d3.interpolateViridis);
        const AllLinks = this.LinkLayer.selectAll("line").data(Graph.Links);
        AllLinks.exit().remove();
        AllLinks.join(
            (Enter) =>
                Enter.append("line")
                    .attr("sourceid", (Link) => Link.Source.ID)
                    .attr("targetid", (Link) => Link.Target.ID)
                    .attr("stroke-width", 0.2)
                    // Color the links based on the distance
                    .attr("stroke", (Link) => DistanceColor(Link.Distance))
                    .attr("stroke-opacity", 0.2)
                    .attr("distance", (Link) => Link.Distance)
                    .attr("interpolated", (Link) => DistanceLerp(Link.Distance)),
            (Update) => Update,
        )
            .attr("x1", (Link) => Link.Source.x!)
            .attr("y1", (Link) => Link.Source.y!)
            .attr("x2", (Link) => Link.Target.x!)
            .attr("y2", (Link) => Link.Target.y!)
            .classed("hidden", (Link) => Link.Hidden ?? false);
        // Visualize components
        if (Graph.Components) {
            const Filtered = this.PreviewFilter !== undefined || this.Filters.size > 0;
            // Calculate the hulls
            Graph.Components.forEach((Component) => {
                const Hull = d3.polygonHull(Component.Nodes.map((Node) => [Node.x!, Node.y!]));
                if (Hull) {
                    Component.Hull = Hull;
                    Component.Centroid = d3.polygonCentroid(Hull);
                } else {
                    delete Component.Hull;
                }
            });
            const Components = Graph.Components.filter((Component) => Component.Hull);
            const AllHulls = this.HullLayer.selectAll("path").data(Components);
            AllHulls.exit().remove();
            AllHulls.join(
                (Enter) =>
                    Enter.append("path")
                        .attr("id", (Component) => `hull-${Component.ID}`)
                        .attr("fill", (Component) =>
                            d3.interpolateSinebow(
                                Components.indexOf(Component) / Components.length,
                            ),
                        )
                        .attr("stroke", (Component) =>
                            d3.interpolateSinebow(
                                Components.indexOf(Component) / Components.length,
                            ),
                        )
                        .on("mouseover", (Event: Event, Component) => {
                            this.ComponentOver(Event, Component);
                        })
                        .on("mouseout", (Event: Event, Component) => {
                            this.ComponentOut(Event, Component);
                        })
                        .on("click", (Event: MouseEvent, Component) => {
                            this.ComponentChosen(Event, Component);
                        }),
                (Update) => Update,
            ).attr("d", (Component) => `M${Component.Hull!.join("L")}Z`);
            // Render the component labels
            const AllComponents = this.ComponentLayer.selectAll("text").data(Components);
            AllComponents.exit().remove();
            AllComponents.join(
                (Enter) =>
                    Enter.append("text")
                        .attr("id", (Component) => `component-${Component.ID}`)
                        .attr("font-size", 5)
                        .attr("text-anchor", "middle")
                        .attr("dominant-baseline", "middle")
                        .attr("stroke", (Component) =>
                            d3.interpolateSinebow(
                                Components.indexOf(Component) / Components.length,
                            ),
                        ),
                (Update) => Update,
            )
                .text((Component) => {
                    if (Component.CurrentNodes && Filtered) {
                        return `${Component.Representative!.Data.Label} (${Component.CurrentNodes.length}/${Component.Nodes.length})`;
                    }
                    return `${Component.Representative!.Data.Label} (${Component.Nodes.length})`;
                })
                .attr("fill", (Component) => {
                    if (Component.CurrentNodes && Filtered) {
                        return d3.interpolateViridis(
                            Component.CurrentNodes.length / Component.Nodes.length,
                        );
                    }
                    return "#ffffff";
                })
                .attr("x", (Component) => Component.Centroid![0])
                .attr("y", (Component) => Component.Centroid![1]);
            // .attr("x", (Component) => d3.mean(Component.Nodes.map(Node => Node.x!))!)
            // .attr("y", (Component) => d3.mean(Component.Nodes.map(Node => Node.y!))!);
        } else {
            this.ComponentLayer.selectAll("text").remove();
        }
    }
    // Layouting
    /** Simulation: The force simulation in-use. */
    private Simulation?: d3.Simulation<d3.SimulationNodeDatum, undefined>;
    /** GenerateLayout: Generate the network layout using a force-based simulation.  */
    public GenerateLayout<T>(Graph: Graph<T>, Renderer: (Alpha: number) => void) {
        const DistanceScale = Math.max(5, Math.sqrt(Graph.Nodes.length));
        this.Simulation = d3.forceSimulation();
        const ForceLink = d3.forceLink();
        this.Simulation.nodes(Graph.Nodes)
            .force(
                "repulse",
                d3
                    .forceManyBody()
                    .distanceMax(30)
                    .strength(-DistanceScale * 5),
            )
            .force("center", d3.forceCenter().strength(0.01))
            .force(
                "link",
                ForceLink.links(Graph.Links.filter((Link) => Link.VisualizeWeight! >= 0.1))
                    .id((Node) => Node.index!)
                    .distance(() => DistanceScale)
                    .strength((Link) => (Link as Link<unknown>).VisualizeWeight!),
            )
            .force(
                "collide",
                d3.forceCollide().radius((Node) => (Node as Node<unknown>).Size! + 2),
            )
            .on("tick", () => {
                Renderer(this.Simulation!.alpha());
                if (this.Simulation!.alpha() <= 0.001) {
                    this.Tutorial.ShowTutorial();
                    Handler.stop();
                }
            });
        const Handler = this.Simulation.alpha(1).alphaTarget(0).restart();
    }
    // History
    /** History: The history of the visualizer. */
    private History = new Map<string, () => void>();
    /** PushState: Push a new state to the history. */
    public PushState(Name: string, Callback: () => void) {
        this.History.set(Name, Callback);
        if (window.location.hash !== `#${Name}`) {
            window.history.pushState(Name, Name, `#${Name}`);
        }
    }
    /** PopState: Handle the pop state event. */
    public PopState(_Event: PopStateEvent) {
        // If there is no hash, hide the dialog
        if (window.location.hash === "") {
            this.Dialog.Hide();
            return;
        }
        // Otherwise, trigger the callback
        const Callback = this.History.get(window.location.hash.slice(1));
        if (Callback) {
            Callback();
        }
    }
}

/** SetClassForComponent: Set a class for a component and its nodes. */
function SetClassForComponent<T>(
    Component: Component<T>,
    Class: string,
    Status: boolean,
    ForNodes = true,
) {
    $(`#component-${Component.ID}`).toggleClass(Class, Status);
    $(`#hull-${Component.ID}`).toggleClass(Class, Status);
    if (ForNodes) {
        Component.Nodes.forEach((Node) => {
            SetClassForNode(Node.ID, Class, Status);
            // SetClassForLinks(Node.ID, Class, Status, (Other) => Component.Nodes.findIndex(Node => Node.ID == Other) != -1);
        });
    }
}

/** SetClassForNode: Set a class for a node and its label. */
function SetClassForNode(ID: string, Class: string, Status: boolean) {
    $(`#node-${ID}`).toggleClass(Class, Status);
    $(`#label-${ID}`).toggleClass(Class, Status);
}

/** SetClassForLinks: Set a class for links and linked nodes of a node. */
function SetClassForLinks(
    ID: string,
    Class: string,
    Status: boolean,
    Filter?: (Other: string) => boolean,
) {
    let Links = $(`line[sourceid="${ID}"]`);
    Links.each((_Index, Element) => {
        const Filtered = Filter?.($(Element).attr("targetid")!) ?? true;
        $(Element).toggleClass(Class, Status && Filtered);
        SetClassForNode($(Element).attr("targetid")!, Class, Status && Filtered);
    });
    Links = $(`line[targetid="${ID}"]`);
    Links.each((_Index, Element) => {
        const Filtered = Filter?.($(Element).attr("sourceid")!) ?? true;
        $(Element).toggleClass(Class, Status && Filtered);
        SetClassForNode($(Element).attr("sourceid")!, Class, Status && Filtered);
    });
}
