import type { Cash } from "cash-dom";
import d3 from "d3";

import type { Code, DataChunk, DataItem } from "../../../schema.js";
import { Panel } from "../panels/panel.js";
import { getItemsFromDataset } from "../utils/dataset.js";
import { ChunkFilter, DatasetFilter } from "../utils/filters.js";
import { filterNodeByExample } from "../utils/graph.js";
import { formatDate } from "../utils/utils.js";
import type { Visualizer } from "../visualizer.js";

/** The dataset side panel. */
export class DatasetSection extends Panel {
    /** The short name of the panel. */
    override name = "Datasets";
    /** The title of the panel. */
    override title = "Dataset Overview";

    /** Constructing the panel. */
    constructor(container: Cash, visualizer: Visualizer) {
        super(container, visualizer);
        this.visualizer = visualizer;
        this.container = $('<div class="dataset"></div>').appendTo(container).hide();
    }

    /** Show the panel. */
    override show() {
        this.container.show();
        this.showDatasets();
    }
    /** The colorizer for ratios. */
    #ratioColorizer = d3.scaleSequential().interpolator(d3.interpolateViridis).domain([0, 1]);
    /** Show all datasets. */
    showDatasets() {
        this.setRefresh(() => {
            this.container.empty();
            // Basic information
            this.container.append($("<h3>Metadata</h3>"));
            this.buildList(
                [
                    { name: "Title", value: this.source.title },
                    { name: "Description", value: this.source.description },
                    { name: "Research Question", value: this.source.researchQuestion },
                    { name: "Notes for Coding", value: this.source.codingNotes },
                ],
                (item, data) => {
                    item.append($(`<strong>${data.name}:</strong>`));
                    item.append($("<span></span>").text(data.value));
                },
            ).appendTo(this.container);
            // Source datasets
            const nodes = this.getGraph<Code>().nodes;
            this.container.append($("<h3>Datasets</h3>"));
            this.buildTable(
                Object.entries(this.source.data),
                (row, [key, value]) => {
                    // Interactivity
                    row.toggleClass("chosen", this.visualizer.isFilterApplied("Dataset", key))
                        .on("mouseover", () =>
                            this.visualizer.setFilter(true, new DatasetFilter(), key),
                        )
                        .on("mouseout", () => this.visualizer.setFilter(true, new DatasetFilter()));
                    // Show the summary
                    const summary = $('<td class="dataset-cell actionable"></td>')
                        .attr("id", `dataset-${key}`)
                        .appendTo(row);
                    summary.append($("<h4></h4>").text(key)).on("click", (event: MouseEvent) => {
                        if (event.shiftKey) {
                            this.visualizer.setFilter(
                                false,
                                new DatasetFilter(),
                                key,
                                event.shiftKey,
                            );
                        } else {
                            this.showDataset(key, value);
                        }
                    });
                    // Find the date
                    const items = getItemsFromDataset(value);
                    const dates = items
                        .map((item) => item.time)
                        .sort((a, b) => a.getTime() - b.getTime());
                    summary.append($('<p class="tips"></p>').text(`From ${formatDate(dates[0])}`));
                    summary.append(
                        $('<p class="tips"></p>').text(`To ${formatDate(dates[dates.length - 1])}`),
                    );
                    // Show the items
                    const ids = new Set(items.map((item) => item.id));
                    const sizeCell = $('<td class="number-cell actionable"></td>')
                        .text(`${ids.size}`)
                        .appendTo(row);
                    sizeCell.append(
                        $('<p class="tips"></p>').text(`${Object.keys(value).length} Chunks`),
                    );
                    // Show the codes
                    const codes = nodes.filter((node) =>
                        filterNodeByExample(node, Array.from(ids)),
                    );
                    const currents = codes.filter((node) => !node.hidden);
                    const color = this.#ratioColorizer(currents.length / codes.length);
                    $('<td class="metric-cell"></td>')
                        .css("background-color", color.toString())
                        .css("color", d3.lab(color).l > 70 ? "black" : "white")
                        .appendTo(row)
                        .text(`${currents.length}`)
                        .append(
                            $("<p></p>").text(d3.format(".0%")(currents.length / codes.length)),
                        );
                    $('<td class="number-cell actionable"></td>')
                        .appendTo(row)
                        .text(`${codes.length}`)
                        .append($("<p></p>").text("100%"));
                    // Generic click event
                    row.children("td:not(.dataset-cell)").on("click", (event: MouseEvent) =>
                        this.visualizer.setFilter(false, new DatasetFilter(), key, event.shiftKey),
                    );
                },
                ["Metadata", "Items", "Filtered", "Codes"],
            );
        });
    }

    /** Show a specific dataset. */
    showDataset(name: string, dataset: Record<string, DataChunk<DataItem>>) {
        // Filter by the dataset, if not already
        if (!this.visualizer.isFilterApplied("Dataset", name)) {
            this.visualizer.setFilter(false, new DatasetFilter(), name);
        }
        // Show the component
        this.setRefresh(() => {
            this.container.empty();
            // Show the title
            this.container.append(
                $(`<h3>${name} (${Object.keys(dataset).length} Chunks)</h3>`).prepend(
                    this.buildReturn(() => {
                        if (this.visualizer.isFilterApplied("Dataset", name)) {
                            this.visualizer.setFilter(false, new DatasetFilter());
                        }
                        this.showDatasets();
                    }),
                ),
            );
            // Show the chunks
            const nodes = this.getGraph<Code>().nodes;
            this.buildTable(
                Object.entries(dataset),
                (row, [key, chunk]) => {
                    // Interactivity
                    row.toggleClass("chosen", this.visualizer.isFilterApplied("Chunk", key))
                        .on("mouseover", () =>
                            this.visualizer.setFilter(true, new ChunkFilter(), key),
                        )
                        .on("mouseout", () => this.visualizer.setFilter(true, new ChunkFilter()));
                    // Show the summary
                    const summary = $('<td class="chunk-cell actionable"></td>')
                        .attr("id", `chunk-${key}`)
                        .appendTo(row);
                    summary.append($("<h4></h4>").text(`Chunk ${key}`));
                    // Find the date
                    let items = chunk.items;
                    items = items.filter((item) =>
                        this.parameters.useExtendedChunk
                            ? true
                            : !("chunk" in item) || !item.chunk || item.chunk === key,
                    );
                    const dates = items
                        .map((item) => {
                            if (!("time" in item)) {
                                throw new Error("Item does not have a time property.");
                            }
                            return item.time;
                        })
                        .sort((a, b) => a.getTime() - b.getTime());
                    summary.append($('<p class="tips"></p>').text(`From ${formatDate(dates[0])}`));
                    summary.append(
                        $('<p class="tips"></p>').text(`To ${formatDate(dates[dates.length - 1])}`),
                    );
                    summary.on("click", () => {
                        this.dialog.showChunk(key, chunk);
                    });
                    // Show the items
                    $('<td class="number-cell actionable"></td>')
                        .text(items.length.toString())
                        .appendTo(row);
                    // Show the codes
                    const codes = nodes.filter((Node) =>
                        filterNodeByExample(
                            Node,
                            items.map((item) => item.id),
                        ),
                    );
                    const currents = codes.filter((node) => !node.hidden);
                    const color = this.#ratioColorizer(currents.length / Math.max(1, codes.length));
                    $('<td class="metric-cell"></td>')
                        .css("background-color", color.toString())
                        .css("color", d3.lab(color).l > 70 ? "black" : "white")
                        .appendTo(row)
                        .text(`${currents.length}`)
                        .append(
                            $("<p></p>").text(d3.format(".0%")(currents.length / codes.length)),
                        );
                    $('<td class="number-cell actionable"></td>')
                        .appendTo(row)
                        .text(`${codes.length}`)
                        .append($("<p></p>").text("100%"));
                    // Generic click event
                    row.children("td:not(.chunk-cell)").on("click", (event: MouseEvent) =>
                        this.visualizer.setFilter(false, new ChunkFilter(), key, event.shiftKey),
                    );
                },
                ["Metadata", "Items", "Filtered", "Codes"],
            );
        });
    }
}
