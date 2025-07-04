import type { Cash, CashStatic } from "cash-dom";
import d3 from "d3";

import type { Code, CodebookComparison, DataChunk, DataItem } from "../../schema.js";

import { Dialog } from "./panels/dialog.js";
import { InfoPanel } from "./panels/info-panel.js";
import { SidePanel } from "./panels/side-panel.js";
import { Tutorial } from "./tutorial.js";
import { evaluateCodebooks } from "./utils/evaluate.js";
import type { Colorizer, FilterBase } from "./utils/filters.js";
import { ComponentFilter, OwnerFilter } from "./utils/filters.js";
import { buildSemanticGraph } from "./utils/graph.js";
import type { Component, Graph, GraphStatus, Link, Node } from "./utils/schema.js";
import { Parameters, postData } from "./utils/utils.js";
declare global {
    const $: typeof Cash.prototype.init & CashStatic;
}

type ChosenCallback<T> = (Node: Node<T>, Status: boolean) => void;

/** Visualizer: The visualization manager. */
export class Visualizer {
    /** The container for the visualization. */
    #container: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    /** The layer for the hulls. */
    #hullLayer: d3.Selection<SVGGElement, unknown, null, undefined>;
    /** The layer for the links. */
    #linkLayer: d3.Selection<SVGGElement, unknown, null, undefined>;
    /** The layer for the nodes. */
    #nodeLayer: d3.Selection<SVGGElement, unknown, null, undefined>;
    /** The layer for the labels. */
    #labelLayer: d3.Selection<SVGGElement, unknown, null, undefined>;
    /** The layer for the components. */
    #componentLayer: d3.Selection<SVGGElement, unknown, null, undefined>;
    /** The interface container of legends. */
    #legendContainer: Cash;
    /** The interface container of filters. */
    #filterContainer: Cash;
    /** The zoom behavior in-use. */
    #zoom: d3.ZoomBehavior<SVGSVGElement, unknown>;
    /** The underlying dataset. */
    dataset: CodebookComparison<DataChunk<DataItem>> = {} as CodebookComparison<
        DataChunk<DataItem>
    >;
    /** The parameters for the visualizer. */
    parameters: Parameters = new Parameters();
    /** The information panel for the visualization. */
    infoPanel: InfoPanel;
    /** The side panel for the visualization. */
    sidePanel: SidePanel;
    /** Dialog for the visualization. */
    dialog: Dialog;
    /** The tutorial for the visualization. */
    tutorial: Tutorial;

    /** Constructing the manager. */
    constructor(container: Cash) {
        window.onpopstate = (event) => {
            this.popState(event);
        };
        // Other components
        this.sidePanel = new SidePanel($(".side-panel"), this);
        this.infoPanel = new InfoPanel($(".info-panel"), this);
        this.dialog = new Dialog($(".dialog"), this);
        this.tutorial = new Tutorial($(".portrait-overlay"), this);
        // Initialize the SVG
        const root = d3
            .select(container.get(0) ?? ({} as HTMLElement))
            .attr("style", "background-color: #290033");
        this.#container = root.append("svg");
        const scaler = this.#container.append("g");
        this.#hullLayer = scaler.append("g").attr("class", "hulls");
        this.#linkLayer = scaler.append("g").attr("class", "links");
        this.#nodeLayer = scaler.append("g").attr("class", "nodes");
        this.#labelLayer = scaler.append("g").attr("class", "labels");
        this.#componentLayer = scaler.append("g").attr("class", "components");
        this.#legendContainer = container.find(".legends");
        this.#filterContainer = container.find(".filters");
        // Zoom support
        this.#zoom = d3
            .zoom<SVGSVGElement, unknown>()
            .scaleExtent([1, 8])
            .on("zoom", (event: { transform: d3.ZoomTransform }) => {
                scaler.attr("transform", event.transform.toString());
                const ScaleProgress = 1 - Math.max(0, 3 - event.transform.k) / 2;
                this.#linkLayer.style("opacity", 0.3 + ScaleProgress);
                // this.NodeLayer.style("opacity", 0.1 + ScaleProgress);
                this.#labelLayer.style("opacity", ScaleProgress);
                this.#componentLayer.style("opacity", 2 - ScaleProgress * 2);
                this.#componentLayer.style("display", ScaleProgress > 0.9 ? "none" : "block");
                // this.ComponentLayer.style("pointer-events", ScaleProgress > 0.6 ? "none" : "all");
            });
        this.#container.call(this.#zoom);
        // Load the data
        void d3.json("network.json").then((data) => {
            this.dataset = data as CodebookComparison<DataChunk<DataItem>>;
            // Set the title
            document.title =
                this.dataset.title + document.title.substring(document.title.indexOf(":"));
            // Parse the date and nicknames as needed
            const datasets = this.dataset.source;
            this.dataset.uidToNicknames = new Map();
            for (const dataset of Object.values(datasets.data)) {
                for (const chunk of Object.values(dataset)) {
                    for (const item of chunk.items) {
                        // TODO: Support subchunks
                        if ("items" in item) {
                            console.warn("Subchunks are not yet supported, skipping");
                            continue;
                        }
                        item.time = new Date(item.time);
                        this.dataset.uidToNicknames.set(item.uid, item.nickname);
                    }
                }
            }
            // Calculate the weights
            this.dataset.weights =
                this.dataset.weights ?? this.dataset.names.map((_, idx) => (idx === 0 ? 0 : 1));
            this.dataset.totalWeight = this.dataset.weights.reduce((A, B) => A + B, 0);
            // Apply the extra parameters
            if (this.dataset.parameters) Object.assign(this.parameters, this.dataset.parameters);
            // Build the default graph
            this.setStatus("Code", buildSemanticGraph(this.dataset, this.parameters));
            this.sidePanel.show();
            // Evaluate and send back the results
            const results = evaluateCodebooks(this.dataset, this.parameters);
            void postData("/api/report/", results);
        });
    }
    // Status management
    /** The status of the visualization. */
    status: GraphStatus<unknown> = {} as GraphStatus<unknown>;
    /** The type of the status. */
    statusType = "";

    /** Use a new graph for visualization. */
    setStatus<T>(type: string, graph: Graph<T>) {
        this.previewFilter = undefined;
        this.#filter.clear();
        this.status = { graph, chosenNodes: [] };
        this.statusType = type;
        this.rerender(true);
        this.centerCamera(0, 0, 1);
    }

    /** Get the status of the visualization. */
    getStatus<T>(): GraphStatus<T> {
        return this.status as GraphStatus<T>;
    }

    /** Rerender the visualization. */
    rerender(relayout = false) {
        // Apply the filter
        this.status.graph.nodes.forEach((node) => {
            let filtered = true as boolean;
            this.#filter.forEach((filter) => (filtered = filtered && filter.filter(this, node)));
            if (this.previewFilter) {
                filtered = filtered && this.previewFilter.filter(this, node);
            }
            node.hidden = !filtered;
        });
        this.status.graph.links.forEach((link) => {
            link.hidden = link.source.hidden ?? link.target.hidden;
        });
        this.status.graph.components?.forEach((component) => {
            component.curNodes = component.nodes.filter((Node) => !Node.hidden);
        });
        // Chose the renderer
        let renderer = (_alpha: number) => {
            // This function is intentionally left empty
        };
        switch (this.statusType) {
            case "Code":
                renderer = (alpha) => {
                    this.renderCodes(alpha);
                };
                break;
        }
        // Render the visualization
        if (relayout) {
            this.generateLayout(this.status.graph, renderer);
        } else {
            renderer(0);
        }
    }

    /** Center the viewport camera to a position and scale.*/
    centerCamera(x: number, y: number, zoom: number, animated = true) {
        if (animated) {
            this.#container
                .transition()
                .duration(500)
                .call((selection) => {
                    this.#zoom.translateTo(selection, x, y);
                })
                .transition()
                .call((selection) => {
                    this.#zoom.scaleTo(selection, zoom);
                });
        } else {
            this.#zoom.translateTo(this.#container, x, y);
            this.#zoom.scaleTo(this.#container, zoom);
        }
    }

    // Filters
    /** The current filters of the graph. */
    #filter = new Map<string, FilterBase<unknown, unknown>>();
    /** The previewing filter of the graph. */
    private previewFilter?: FilterBase<unknown, unknown>;
    /** Try to set a filter for the visualization. */
    setFilter<TNode, TParameter>(
        previewing: boolean,
        filter: FilterBase<TNode, TParameter>,
        parameters: TParameter | undefined = undefined,
        additive = false,
        mode = "",
    ) {
        if (previewing) {
            if (parameters === undefined) {
                delete this.previewFilter;
                parameters = undefined;
            } else if (this.#filter.has(filter.name)) {
                // Do not preview something fixed
                delete this.previewFilter;
                parameters = undefined;
            } else if (filter.name === this.previewFilter?.name) {
                if (
                    !this.previewFilter.toggleParameters(parameters, additive, mode) &&
                    this.previewFilter.parameters.length === 0
                ) {
                    delete this.previewFilter;
                    parameters = undefined;
                }
            } else {
                this.previewFilter = filter as FilterBase<unknown, unknown>;
                this.previewFilter.setParameter([parameters]);
                this.previewFilter.mode = mode;
            }
        } else {
            const incumbent = this.#filter.get(filter.name);
            if (parameters === undefined) {
                this.#filter.delete(filter.name);
                parameters = undefined;
            } else if (filter.name === incumbent?.name) {
                if (
                    !incumbent.toggleParameters(parameters, additive, mode) &&
                    incumbent.parameters.length === 0
                ) {
                    this.#filter.delete(filter.name);
                    parameters = undefined;
                }
            } else {
                this.#filter.set(filter.name, filter as FilterBase<unknown, unknown>);
                filter.setParameter([parameters]);
                filter.mode = mode;
            }
            delete this.previewFilter;
        }
        if (!previewing) {
            this.nodeChosen(new MouseEvent("click"), undefined);
        }
        this.rerender();
        if (!previewing) {
            this.#renderFilters();
            this.sidePanel.render();
        }
        return parameters !== undefined;
    }

    /** Get the colorizer for the visualization. */
    getColorizer() {
        let colorizer = this.previewFilter?.getColorizer(this);
        if (!colorizer) {
            for (const filter of this.#filter.values()) {
                colorizer = filter.getColorizer(this);
                if (colorizer) {
                    break;
                }
            }
        }
        colorizer ??= new OwnerFilter().getColorizer(this);
        return colorizer;
    }

    /** Get a filter by its name. */
    getFilter<TNode, TParameter>(name: string) {
        return this.#filter.get(name) as FilterBase<TNode, TParameter> | undefined;
    }

    /** Check if a filter is applied. */
    isFilterApplied(name: string, parameter: unknown, mode?: string): boolean {
        const filter = this.#filter.get(name);
        if (mode && filter?.mode !== mode) {
            return false;
        }
        return filter?.parameters.includes(parameter) ?? false;
    }

    /** Render all current filters. */
    #renderFilters() {
        this.#filterContainer.empty();
        this.#filter.forEach((filter) => {
            const container = $('<div class="filter"></div>').appendTo(this.#filterContainer);
            container.append($("<span></span>").text(`${filter.name}:`));
            const names = filter.getParameterNames(this);
            for (let i = 0; i < filter.parameters.length; i++) {
                const parameter = filter.parameters[i];
                const label = names[i];
                container.append(
                    $('<a href="javascript:void(0)" class="parameter"></a>')
                        .text(label)
                        .on("click", () => this.setFilter(false, filter, parameter)),
                );
            }
            container.append(
                $('<a href="javascript:void(0)" class="close"></a>')
                    .text("X")
                    .on("click", () => this.setFilter(false, filter)),
            );
        });
    }

    // Node events
    /** Handle the mouse-over event on a node. */
    nodeOver<T>(_event: Event, node: Node<T>) {
        setClassForNode(node.id, "hovering", true);
        setClassForLinks(node.id, "hovering", true);
        if (!this.getStatus().chosenNodes.includes(node)) {
            this.triggerChosenCallback(node, true);
        }
    }

    /** Handle the mouse-out event on a node. */
    nodeOut<T>(_event: Event, node: Node<T>) {
        setClassForNode(node.id, "hovering", false);
        setClassForLinks(node.id, "hovering", false);
        if (!this.getStatus().chosenNodes.includes(node)) {
            this.triggerChosenCallback(node, false);
        }
    }

    /** The callback for chosen nodes. */
    chosenCallbacks = new Map<string, ChosenCallback<unknown>>();

    /** Register a callback for a certain data type. */
    registerChosenCallback<T>(name: string, callback: ChosenCallback<T>) {
        this.chosenCallbacks.set(name, callback as ChosenCallback<unknown>);
    }

    /** Trigger a callback for a certain node. */
    triggerChosenCallback<T>(node: Node<T>, status: boolean) {
        const callback = this.chosenCallbacks.get(node.type);
        if (callback) {
            callback(node, status);
        }
    }

    /** Handle the click event on a node. */
    nodeChosen<T>(event: MouseEvent, node?: Node<T>, additive = false) {
        let chosens = this.getStatus().chosenNodes;
        const incumbent = node && chosens.includes(node);
        // If no new mode, remove all
        // If there is a new mode and no shift key, remove all
        const removal = node === undefined || (!additive && !incumbent && !event.shiftKey);
        if (removal) {
            chosens.forEach((Node) => {
                setClassForNode(Node.id, "chosen", false);
                setClassForLinks(Node.id, "chosen-neighbor", false);
                this.triggerChosenCallback(Node, false);
            });
            chosens = [];
        }
        if (node) {
            if (!incumbent) {
                // If there is a new mode, add it
                chosens.push(node);
                setClassForNode(node.id, "chosen", true);
                setClassForLinks(node.id, "chosen-neighbor", true);
                this.triggerChosenCallback(node, true);
            } else {
                // If the node is chosen, remove it
                chosens.splice(chosens.indexOf(node), 1);
                setClassForNode(node.id, "chosen", false);
                setClassForLinks(node.id, "chosen-neighbor", false);
                this.triggerChosenCallback(node, false);
            }
        }
        // Update the status
        this.getStatus().chosenNodes = chosens;
        this.#container.classed("node-chosen", chosens.length > 0);
        this.sidePanel.render();
        return node !== undefined && chosens.includes(node);
    }

    /** Focus on a node by its SVG element. */
    focusOnNode(element: SVGElement) {
        const node = d3.select(element).datum() as Node<unknown>;
        this.centerCamera(node.x ?? NaN, node.y ?? NaN, 3, false);
        if (!this.getStatus().chosenNodes.includes(node)) {
            this.nodeChosen(new MouseEvent("click"), node);
        }
    }

    // Component events
    /** Handle the mouse-over event on a component. */
    componentOver<T>(_event: Event, component: Component<T>) {
        setClassForComponent(component, "hovering", true);
    }

    /** Handle the mouse-out event on a component. */
    componentOut<T>(_event: Event, component: Component<T>) {
        setClassForComponent(component, "hovering", false);
    }

    /** Handle the click event on a component. */
    componentChosen<T extends Code>(event: MouseEvent, component: Component<T>) {
        const status = this.setFilter(false, new ComponentFilter(), component, event.shiftKey);
        if (status) {
            this.centerCamera(
                d3.mean(component.nodes.map((node) => node.x ?? NaN)) ?? NaN,
                d3.mean(component.nodes.map((node) => node.y ?? NaN)) ?? NaN,
                3,
            );
        }
        setClassForComponent(component, "chosen", status, false);
        this.#container.classed("component-chosen", status);
    }

    // Rendering
    /** Render the legends for the visualization. */
    #renderLegends(colorizer: Colorizer<unknown>) {
        // Check if the legends are up-to-date
        const hash =
            JSON.stringify(colorizer.examples) +
            JSON.stringify(Object.values(colorizer.results ?? {}).map((values) => values.length));
        if (this.#legendContainer.data("hash") === hash) {
            return;
        }
        this.#legendContainer.empty().data("hash", hash);
        // Render the legends
        for (const example in colorizer.examples) {
            const color = colorizer.examples[example];
            this.#legendContainer.append(`<div class="legend">
                <svg width="20" height="20"><circle cx="10" cy="10" r="8" fill="${color}"/></svg>
                <span>${example} (${colorizer.results?.[color]?.length ?? 0})</span>
            </div>`);
        }
    }

    /** Render the coding graph to the container. */
    renderCodes(alpha: number) {
        // Basic settings
        this.#container.attr("viewBox", "0 0 300 300");
        this.#zoom.extent([
            [0, 0],
            [300, 300],
        ]);
        // Find the colorizer to use
        const colorizer = this.getColorizer();
        colorizer.results = {};
        // Render nodes
        const graph = this.getStatus<Code>().graph;
        const allNodes = this.#nodeLayer.selectAll("circle").data(graph.nodes);
        allNodes.exit().remove();
        allNodes
            .join(
                (enter) =>
                    enter
                        .append("circle")
                        .attr("id", (node) => `node-${node.id}`)
                        .attr("label", (node) => node.data.label)
                        .on("mouseover", (event: Event, node) => {
                            this.nodeOver(event, node);
                        })
                        .on("mouseout", (event: Event, node) => {
                            this.nodeOut(event, node);
                        })
                        .on("click", (event: MouseEvent, node) => this.nodeChosen(event, node)),
                (update) => update,
            )
            // Set the fill color based on the number of owners
            .attr("fill", (node) => {
                let color = colorizer.colorize(node);
                if (node.hidden) {
                    color = "#999999";
                }
                if (!colorizer.results?.[color] && colorizer.results) {
                    colorizer.results[color] = [];
                }
                colorizer.results?.[color].push(node);
                return color;
            })
            // Set the radius based on the number of examples
            .attr("r", (node) => ((node as Node<unknown>).size ?? NaN) * 0.5)
            .attr("cx", (node) => node.x ?? NaN)
            .attr("cy", (node) => node.y ?? NaN)
            .classed("hidden", (node) => node.hidden ?? false);
        // Render legends
        this.#renderLegends(colorizer);
        // Render labels
        const allLabels = this.#labelLayer.selectAll("text").data(graph.nodes);
        allLabels.exit().remove();
        if (alpha <= 0.3) {
            allLabels
                .join(
                    (enter) =>
                        enter
                            .append("text")
                            .attr("id", (node) => `label-${node.id}`)
                            .text((node) => node.data.label)
                            .attr("fill", "#e0e0e0")
                            .attr("fill-opacity", 0.7)
                            .attr("font-size", 1.2),
                    (update) => update,
                )
                .attr(
                    "x",
                    (node) => (node.x ?? NaN) + ((node as Node<unknown>).size ?? NaN) * 0.5 + 0.25,
                )
                .attr("y", (node) => (node.y ?? NaN) + 0.27)
                .classed("hidden", (node) => node.hidden ?? false);
        }
        // Render links
        const distanceLerp = d3
            .scaleSequential()
            .clamp(true)
            .domain([graph.maxDist, this.parameters.linkMinDist]);
        const distanceColor = d3
            .scaleSequential()
            .clamp(true)
            .domain([graph.maxDist, this.parameters.linkMinDist])
            .interpolator(d3.interpolateViridis);
        const allLinks = this.#linkLayer.selectAll("line").data(graph.links);
        allLinks.exit().remove();
        allLinks
            .join(
                (enter) =>
                    enter
                        .append("line")
                        .attr("sourceid", (link) => link.source.id)
                        .attr("targetid", (link) => link.target.id)
                        .attr("stroke-width", 0.2)
                        // Color the links based on the distance
                        .attr("stroke", (link) => distanceColor(link.distance))
                        .attr("stroke-opacity", 0.2)
                        .attr("distance", (link) => link.distance)
                        .attr("interpolated", (link) => distanceLerp(link.distance)),
                (update) => update,
            )
            .attr("x1", (link) => link.source.x ?? NaN)
            .attr("y1", (link) => link.source.y ?? NaN)
            .attr("x2", (link) => link.target.x ?? NaN)
            .attr("y2", (link) => link.target.y ?? NaN)
            .classed("hidden", (link) => link.hidden ?? false);
        // Visualize components
        if (graph.components) {
            const filtered = this.previewFilter !== undefined || this.#filter.size > 0;
            // Calculate the hulls
            graph.components.forEach((component) => {
                const hull = d3.polygonHull(
                    component.nodes.map((node) => [node.x ?? NaN, node.y ?? NaN]),
                );
                if (hull) {
                    component.hull = hull;
                    component.centroid = d3.polygonCentroid(hull);
                } else {
                    delete component.hull;
                }
            });
            const components = graph.components.filter((component) => component.hull);
            const allHulls = this.#hullLayer.selectAll("path").data(components);
            allHulls.exit().remove();
            allHulls
                .join(
                    (enter) =>
                        enter
                            .append("path")
                            .attr("id", (component) => `hull-${component.id}`)
                            .attr("fill", (component) =>
                                d3.interpolateSinebow(
                                    components.indexOf(component) / components.length,
                                ),
                            )
                            .attr("stroke", (component) =>
                                d3.interpolateSinebow(
                                    components.indexOf(component) / components.length,
                                ),
                            )
                            .on("mouseover", (event: Event, component) => {
                                this.componentOver(event, component);
                            })
                            .on("mouseout", (event: Event, component) => {
                                this.componentOut(event, component);
                            })
                            .on("click", (event: MouseEvent, component) => {
                                this.componentChosen(event, component);
                            }),
                    (update) => update,
                )
                .attr("d", (component) => `M${(component.hull ?? []).join("L")}Z`);
            // Render the component labels
            const allComponents = this.#componentLayer.selectAll("text").data(components);
            allComponents.exit().remove();
            allComponents
                .join(
                    (enter) =>
                        enter
                            .append("text")
                            .attr("id", (component) => `component-${component.id}`)
                            .attr("font-size", 5)
                            .attr("text-anchor", "middle")
                            .attr("dominant-baseline", "middle")
                            .attr("stroke", (component) =>
                                d3.interpolateSinebow(
                                    components.indexOf(component) / components.length,
                                ),
                            ),
                    (update) => update,
                )
                .text((component) => {
                    if (component.curNodes && filtered) {
                        return `${component.representative?.data.label} (${component.curNodes.length}/${component.nodes.length})`;
                    }
                    return `${component.representative?.data.label} (${component.nodes.length})`;
                })
                .attr("fill", (component) => {
                    if (component.curNodes && filtered) {
                        return d3.interpolateViridis(
                            component.curNodes.length / component.nodes.length,
                        );
                    }
                    return "#ffffff";
                })
                .attr("x", (component) => component.centroid?.[0] ?? NaN)
                .attr("y", (component) => component.centroid?.[1] ?? NaN);
            // .attr("x", (Component) => d3.mean(Component.Nodes.map(Node => Node.x!))!)
            // .attr("y", (Component) => d3.mean(Component.Nodes.map(Node => Node.y!))!);
        } else {
            this.#componentLayer.selectAll("text").remove();
        }
    }

    // Layouting
    /** The force simulation in-use. */
    #simulation?: d3.Simulation<d3.SimulationNodeDatum, undefined>;

    /** Generate the network layout using a force-based simulation.  */
    generateLayout<T>(graph: Graph<T>, renderer: (alpha: number) => void) {
        const distanceScale = Math.max(5, Math.sqrt(graph.nodes.length));
        this.#simulation = d3.forceSimulation();
        const forceLink = d3.forceLink();
        this.#simulation
            .nodes(graph.nodes)
            .force(
                "repulse",
                d3
                    .forceManyBody()
                    .distanceMax(30)
                    .strength(-distanceScale * 5),
            )
            .force("center", d3.forceCenter().strength(0.01))
            .force(
                "link",
                forceLink
                    .links(graph.links.filter((link) => (link.visualizeWeight ?? NaN) >= 0.1))
                    .id((node) => node.index ?? NaN)
                    .distance(() => distanceScale)
                    .strength((link) => (link as Link<unknown>).visualizeWeight ?? NaN),
            )
            .force(
                "collide",
                d3.forceCollide().radius((node) => ((node as Node<unknown>).size ?? NaN) + 2),
            )
            .on("tick", () => {
                renderer(this.#simulation?.alpha() ?? NaN);
                if ((this.#simulation?.alpha() ?? NaN) <= 0.001) {
                    this.tutorial.showTutorial();
                    handler.stop();
                }
            });
        const handler = this.#simulation.alpha(1).alphaTarget(0).restart();
    }

    // History
    /** The history of the visualizer. */
    #history = new Map<string, () => void>();

    /** Push a new state to the history. */
    pushState(name: string, callback: () => void) {
        this.#history.set(name, callback);
        if (window.location.hash !== `#${name}`) {
            window.history.pushState(name, name, `#${name}`);
        }
    }

    /** Handle the pop state event. */
    popState(_event: PopStateEvent) {
        // If there is no hash, hide the dialog
        if (window.location.hash === "") {
            this.dialog.hide();
            return;
        }
        // Otherwise, trigger the callback
        const callback = this.#history.get(window.location.hash.slice(1));
        if (callback) {
            callback();
        }
    }
}

/** Set a class for a component and its nodes. */
const setClassForComponent = <T>(
    component: Component<T>,
    className: string,
    status: boolean,
    forNodes = true,
) => {
    $(`#component-${component.id}`).toggleClass(className, status);
    $(`#hull-${component.id}`).toggleClass(className, status);
    if (forNodes) {
        component.nodes.forEach((node) => {
            setClassForNode(node.id, className, status);
            // SetClassForLinks(Node.ID, Class, Status, (Other) => Component.Nodes.findIndex(Node => Node.ID == Other) != -1);
        });
    }
};

/** Set a class for a node and its label. */
const setClassForNode = (id: string, className: string, status: boolean) => {
    $(`#node-${id}`).toggleClass(className, status);
    $(`#label-${id}`).toggleClass(className, status);
};

/** Set a class for links and linked nodes of a node. */
const setClassForLinks = (
    id: string,
    className: string,
    status: boolean,
    filter?: (other: string) => boolean,
) => {
    let links = $(`line[sourceid="${id}"]`);
    links.each((_idx, element) => {
        const Filtered = filter?.($(element).attr("targetid") ?? "") ?? true;
        $(element).toggleClass(className, status && Filtered);
        setClassForNode($(element).attr("targetid") ?? "", className, status && Filtered);
    });
    links = $(`line[targetid="${id}"]`);
    links.each((_idx, element) => {
        const Filtered = filter?.($(element).attr("sourceid") ?? "") ?? true;
        $(element).toggleClass(className, status && Filtered);
        setClassForNode($(element).attr("sourceid") ?? "", className, status && Filtered);
    });
};
