import type { Cash } from "cash-dom";
import d3 from "d3";

import type { Code } from "../../../schema.js";
import { Panel } from "../panels/panel.js";
import { filterNodesByOwner } from "../utils/graph.js";
import type { Component } from "../utils/schema.js";
import { downloadFile, exportCSV, getCodebookColor } from "../utils/utils.js";
import type { Visualizer } from "../visualizer.js";

/** The code side panel. */
export class CodeSection extends Panel {
    /** The short name of the panel. */
    override name = "Codes";
    /** The title of the panel. */
    override title = "Consolidated Codes";

    /** Constructing the panel. */
    constructor(container: Cash, visualizer: Visualizer) {
        super(container, visualizer);
        this.visualizer = visualizer;
        this.container = $('<div class="code"></div>').appendTo(container).hide();
    }

    /** Show the panel. */
    override show() {
        this.container.show();
        this.showComponents();
    }
    /** RatioColorizer: The colorizer for ratios. */
    #ratioColorizer = d3.scaleSequential().interpolator(d3.interpolateViridis).domain([0, 1]);
    /** Show all components. */
    showComponents() {
        this.setRefresh(() => {
            this.container.empty();
            // Some notes
            var Features = $('<p class="tips"></p>')
                .appendTo(this.container)
                .html(
                    `Clusters are not deterministic, only to help understand the data. Names are chosen by connectedness.
                    <a href="javascript:void(0)">Click here</a> to visualize codebooks' coverage by clusters.
                    <a href="javascript:void(0)">Click here</a> to export all codes and clusters.`,
                ).find("a");
            Features.filter("a").eq(0).on("click", () => {
                this.visualizer.dialog.compareCoverageByClusters();
            });
            Features.filter("a").eq(1).on("click", () => {
                this.exportCodesAndClusters();
            });
            // Show the components
            const components = this.getGraph<Code>().components ?? [];
            this.container.append(
                $(`<h3>${components.length} Clusters, ${this.dataset.codes.length} Codes</h3>`),
            );
            this.buildTable(
                components,
                (row, component, idx) => {
                    // Interactivity
                    row.on("mouseover", (event: Event) => {
                        this.visualizer.componentOver(event, component);
                    })
                        .on("mouseout", (event: Event) => {
                            this.visualizer.componentOut(event, component);
                        })
                        .toggleClass(
                            "chosen",
                            this.visualizer.isFilterApplied("Component", component),
                        );
                    // Show the summary
                    const summary = $('<td class="cluster-cell"></td>')
                        .attr("id", `cluster-${component.id}`)
                        .addClass("actionable")
                        .on("click", (event: MouseEvent) => {
                            if (event.shiftKey) {
                                this.visualizer.componentChosen(event, component);
                            } else {
                                this.showComponent(component);
                            }
                        })
                        .appendTo(row);
                    summary.append(
                        $("<h4></h4>").text(`#${idx + 1} ${component.representative?.data.label}`),
                    );
                    // Calculate the coverage of each codebook
                    const codebooks: Map<number, number> = this.dataset.names.reduce(
                        (prev, _name, idx) => {
                            prev.set(
                                idx,
                                filterNodesByOwner(
                                    component.nodes,
                                    idx,
                                    this.parameters.useNearOwners,
                                ).length,
                            );
                            return prev;
                        },
                        new Map<number, number>(),
                    );
                    // Show the owners
                    const owners = $('<p class="owners"></p>').appendTo(summary);
                    this.dataset.names.forEach((_name, nameIndex) => {
                        const count = codebooks.get(nameIndex) ?? NaN;
                        if (nameIndex === 0 || count === 0) {
                            return;
                        }
                        owners.append(
                            $(
                                `<a href="javascript:void(0)" style="color: ${getCodebookColor(nameIndex, this.dataset.codebooks.length)}">${
                                    this.dataset.names[nameIndex]
                                }</a>`,
                            ).attr(
                                "title",
                                `${count} codes (${d3.format(".0%")(count / component.nodes.length)})`,
                            ),
                        );
                    });
                    // Show the numbers
                    const filtered = component.nodes.filter((node) => !node.hidden).length;
                    const color = this.#ratioColorizer(filtered / component.nodes.length);
                    $('<td class="metric-cell"></td>')
                        .css("background-color", color.toString())
                        .css("color", d3.lab(color).l > 70 ? "black" : "white")
                        .appendTo(row)
                        .text(`${filtered}`)
                        .append(
                            $("<p></p>").text(d3.format(".0%")(filtered / component.nodes.length)),
                        )
                        .on("click", (event: MouseEvent) => {
                            this.visualizer.componentChosen(event, component);
                        });
                    $('<td class="number-cell actionable"></td>')
                        .appendTo(row)
                        .text(`${component.nodes.length}`)
                        .append($("<p></p>").text("100%"))
                        .on("click", (event: MouseEvent) => {
                            this.visualizer.componentChosen(event, component);
                        });
                },
                ["Cluster", "Filtered", "Codes"],
            );
        });
    }

    /** Show a code component. */
    showComponent(component: Component<Code>) {
        // Switch to the component, if not already
        if (!this.visualizer.isFilterApplied("Component", component)) {
            this.visualizer.componentChosen(new MouseEvent("virtual"), component);
        }
        // Show the component
        this.setRefresh(() => {
            const colorizer = this.visualizer.getColorizer();
            this.container.empty();
            // Some notes
            this.container.append(
                $('<p class="tips"></p>').text(
                    "Note that clusters are not deterministic, only to help understand the data. Names are chosen from the most connected codes.",
                ),
            );
            // Show the component
            this.container.append(
                $(`<h3>${component.nodes.length} Codes</h3>`).prepend(
                    this.buildReturn(() => {
                        this.visualizer.componentChosen(new MouseEvent("virtual"), component);
                        this.showComponents();
                    }),
                ),
            );
            this.buildTable(
                component.nodes,
                (row, node) => {
                    // Interactivity
                    row.on("mouseover", (event: Event) => {
                        this.visualizer.nodeOver(event, node);
                    })
                        .on("mouseout", (event: Event) => {
                            this.visualizer.nodeOut(event, node);
                        })
                        .toggleClass(
                            "chosen",
                            this.visualizer.getStatus().chosenNodes.includes(node),
                        )
                        .on("click", (event: MouseEvent) => {
                            if (this.visualizer.nodeChosen(event, node)) {
                                this.visualizer.centerCamera(node.x ?? NaN, node.y ?? NaN, 3);
                            }
                        });
                    // Show the summary
                    const summary = $('<td class="code-cell actionable"></td>')
                        .attr("id", `code-${node.id}`)
                        .appendTo(row);
                    // Calculate source codes
                    const from = (node.data.alternatives ?? [])
                        .concat(node.data.label)
                        .filter((name) =>
                            Object.values(this.dataset.codebooks).some(
                                (code) => typeof code[name] !== "undefined",
                            ),
                        ).length;
                    // Colorize the code in the same way as the graph
                    let color = node.hidden ? "#999999" : colorizer.colorize(node);
                    summary.append(
                        $("<h4></h4>")
                            .append(
                                $(
                                    `<svg width="2" height="2" viewbox="0 0 2 2"><circle r="1" cx="1" cy="1" fill="${color}"></circle></svg>`,
                                ),
                            )
                            .append($("<span></span>").text(node.data.label)),
                    );
                    summary.append($('<p class="tips"></p>').text(`From ${from} codes`));
                    // Show the consensus
                    const owners = $('<td class="metric-cell"></td>').appendTo(row);
                    // let OwnerSet = this.Parameters.UseNearOwners ? Node.Owners : Node.NearOwners;
                    // let Count = [...OwnerSet].filter(Owner => this.Dataset.Weights![Owner] !== 0).length;
                    const ratio = node.totalWeight / (this.dataset.totalWeight ?? NaN);
                    color = this.#ratioColorizer(ratio);
                    owners
                        .text(d3.format(".0%")(ratio))
                        .css("background-color", color.toString())
                        .css("color", d3.lab(color).l > 70 ? "black" : "white");
                    // Show the examples
                    row.append(
                        $('<td class="number-cell actionable"></td>').text(
                            `${node.data.examples?.length ?? 0}`,
                        ),
                    );
                },
                ["Code", "Consensus", "Cases"],
            );
        });
    }

    /** Export all codes and clusters to CSV format. */
    exportCodesAndClusters() {
        const graph = this.getGraph<Code>();
        const components = graph.components ?? [];
        const allNodes = graph.nodes;
        
        // Helper function to add node data to CSV
        const addNodeToCSV = (csvData: string[][], categoryName: string, node: typeof allNodes[0]) => {
            const examples = (node.data.examples ?? [])
                .map(example => example.replace("|||", ": "))
                .join("\n");
            csvData.push([categoryName, node.data.label, node.data.alternatives?.join("\n") ?? "", examples]);
        };
        
        // Build CSV data
        const csvData: string[][] = [["Category", "Code", "RawCodes", "Examples"]];
        
        // Add cluster data
        components.forEach((component, clusterIndex) => {
            const clusterName = `${component.representative?.data.label ?? `Cluster ${clusterIndex + 1}`}`;
            // Only include filtered (non-hidden) nodes
            component.nodes.filter((node) => !node.hidden).forEach((node) => {
                addNodeToCSV(csvData, clusterName, node);
            });
        });
        
        // Add unclustered codes (if any) - also filter these
        const clusteredNodeIds = new Set(components.flatMap(c => c.nodes.map(n => n.id)));
        allNodes.filter(node => !clusteredNodeIds.has(node.id) && !node.hidden).forEach((node) => {
            addNodeToCSV(csvData, "unclustered", node);
        });
        
        // Convert to CSV format
        const csvContent = exportCSV(csvData);

        // Download the content
        downloadFile(csvContent, "codes.csv", "text/csv;charset=utf-8");
    }
}
