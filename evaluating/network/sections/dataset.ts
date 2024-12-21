import type { Cash } from "cash-dom";
import d3 from "d3";

import type { Code, DataChunk, DataItem } from "../../../utils/schema.js";
import { Panel } from "../panels/panel.js";
import { GetItemsFromDataset } from "../utils/dataset.js";
import { ChunkFilter, DatasetFilter } from "../utils/filters.js";
import { FilterNodeByExample } from "../utils/graph.js";
import { FormatDate } from "../utils/utils.js";
import type { Visualizer } from "../visualizer.js";

/** DatasetSection: The dataset side panel. */
export class DatasetSection extends Panel {
    /** Name: The short name of the panel. */
    public Name = "Datasets";
    /** Title: The title of the panel. */
    public override Title = "Dataset Overview";
    /** Constructor: Constructing the panel. */
    public constructor(Container: Cash, Visualizer: Visualizer) {
        super(Container, Visualizer);
        this.Visualizer = Visualizer;
        this.Container = $('<div class="dataset"></div>').appendTo(Container).hide();
    }
    /** Show: Show the panel. */
    public override Show() {
        this.Container.show();
        this.ShowDatasets();
    }
    /** RatioColorizer: The colorizer for ratios. */
    private RatioColorizer = d3
        .scaleSequential()
        .interpolator(d3.interpolateViridis)
        .domain([0, 1]);
    /** ShowDatasets: Show all datasets. */
    public ShowDatasets() {
        this.SetRefresh(() => {
            this.Container.empty();
            // Basic information
            this.Container.append($("<h3>Metadata</h3>"));
            this.BuildList(
                [
                    { Name: "Title", Value: this.Source.Title },
                    { Name: "Description", Value: this.Source.Description },
                    { Name: "Research Question", Value: this.Source.ResearchQuestion },
                    { Name: "Notes for Coding", Value: this.Source.CodingNotes },
                ],
                (Item, Data) => {
                    Item.append($(`<strong>${Data.Name}:</strong>`));
                    Item.append($("<span></span>").text(Data.Value));
                },
            ).appendTo(this.Container);
            // Source datasets
            const Nodes = this.GetGraph<Code>().Nodes;
            this.Container.append($("<h3>Datasets</h3>"));
            this.BuildTable(
                Object.entries(this.Source.Data),
                (Row, [Key, Value]) => {
                    // Interactivity
                    Row.toggleClass("chosen", this.Visualizer.IsFilterApplied("Dataset", Key))
                        .on("mouseover", () =>
                            this.Visualizer.SetFilter(true, new DatasetFilter(), Key),
                        )
                        .on("mouseout", () => this.Visualizer.SetFilter(true, new DatasetFilter()));
                    // Show the summary
                    const Summary = $('<td class="dataset-cell actionable"></td>')
                        .attr("id", `dataset-${Key}`)
                        .appendTo(Row);
                    Summary.append($("<h4></h4>").text(Key)).on("click", (Event: MouseEvent) => {
                        if (Event.shiftKey) {
                            this.Visualizer.SetFilter(
                                false,
                                new DatasetFilter(),
                                Key,
                                Event.shiftKey,
                            );
                        } else {
                            this.ShowDataset(Key, Value);
                        }
                    });
                    // Find the date
                    const Items = GetItemsFromDataset(Value);
                    const Dates = Items.map((Item) => Item.Time).sort(
                        (A, B) => A.getTime() - B.getTime(),
                    );
                    Summary.append($('<p class="tips"></p>').text(`From ${FormatDate(Dates[0])}`));
                    Summary.append(
                        $('<p class="tips"></p>').text(`To ${FormatDate(Dates[Dates.length - 1])}`),
                    );
                    // Show the items
                    const IDs = new Set(Items.map((Item) => Item.ID));
                    const SizeCell = $('<td class="number-cell actionable"></td>')
                        .text(`${IDs.size}`)
                        .appendTo(Row);
                    SizeCell.append(
                        $('<p class="tips"></p>').text(`${Object.keys(Value).length} Chunks`),
                    );
                    // Show the codes
                    const Codes = Nodes.filter((Node) =>
                        FilterNodeByExample(Node, Array.from(IDs)),
                    );
                    const Currents = Codes.filter((Node) => !Node.Hidden);
                    const Color = this.RatioColorizer(Currents.length / Codes.length);
                    $('<td class="metric-cell"></td>')
                        .css("background-color", Color.toString())
                        .css("color", d3.lab(Color).l > 70 ? "black" : "white")
                        .appendTo(Row)
                        .text(`${Currents.length}`)
                        .append(
                            $("<p></p>").text(d3.format(".0%")(Currents.length / Codes.length)),
                        );
                    $('<td class="number-cell actionable"></td>')
                        .appendTo(Row)
                        .text(`${Codes.length}`)
                        .append($("<p></p>").text("100%"));
                    // Generic click event
                    Row.children("td:not(.dataset-cell)").on("click", (Event: MouseEvent) =>
                        this.Visualizer.SetFilter(false, new DatasetFilter(), Key, Event.shiftKey),
                    );
                },
                ["Metadata", "Items", "Filtered", "Codes"],
            );
        });
    }
    /** ShowDataset: Show a specific dataset. */
    public ShowDataset(Name: string, Dataset: Record<string, DataChunk<DataItem>>) {
        // Filter by the dataset, if not already
        if (!this.Visualizer.IsFilterApplied("Dataset", Name)) {
            this.Visualizer.SetFilter(false, new DatasetFilter(), Name);
        }
        // Show the component
        this.SetRefresh(() => {
            this.Container.empty();
            // Show the title
            this.Container.append(
                $(`<h3>${Name} (${Object.keys(Dataset).length} Chunks)</h3>`).prepend(
                    this.BuildReturn(() => {
                        if (this.Visualizer.IsFilterApplied("Dataset", Name)) {
                            this.Visualizer.SetFilter(false, new DatasetFilter());
                        }
                        this.ShowDatasets();
                    }),
                ),
            );
            // Show the chunks
            const Nodes = this.GetGraph<Code>().Nodes;
            this.BuildTable(
                Object.entries(Dataset),
                (Row, [Key, Chunk]) => {
                    // Interactivity
                    Row.toggleClass("chosen", this.Visualizer.IsFilterApplied("Chunk", Key))
                        .on("mouseover", () =>
                            this.Visualizer.SetFilter(true, new ChunkFilter(), Key),
                        )
                        .on("mouseout", () => this.Visualizer.SetFilter(true, new ChunkFilter()));
                    // Show the summary
                    const Summary = $('<td class="chunk-cell actionable"></td>')
                        .attr("id", `chunk-${Key}`)
                        .appendTo(Row);
                    Summary.append($("<h4></h4>").text(`Chunk ${Key}`));
                    // Find the date
                    let Items = Chunk.AllItems ?? [];
                    Items = Items.filter((Item) =>
                        this.Parameters.UseExtendedChunk ? true : !Item.Chunk || Item.Chunk === Key,
                    );
                    const Dates = Items.map((Item) => Item.Time).sort(
                        (A, B) => A.getTime() - B.getTime(),
                    );
                    Summary.append($('<p class="tips"></p>').text(`From ${FormatDate(Dates[0])}`));
                    Summary.append(
                        $('<p class="tips"></p>').text(`To ${FormatDate(Dates[Dates.length - 1])}`),
                    );
                    Summary.on("click", () => {
                        this.Dialog.ShowChunk(Key, Chunk);
                    });
                    // Show the items
                    $('<td class="number-cell actionable"></td>')
                        .text(Items.length.toString())
                        .appendTo(Row);
                    // Show the codes
                    const Codes = Nodes.filter((Node) =>
                        FilterNodeByExample(
                            Node,
                            Items.map((Item) => Item.ID),
                        ),
                    );
                    const Currents = Codes.filter((Node) => !Node.Hidden);
                    const Color = this.RatioColorizer(Currents.length / Math.max(1, Codes.length));
                    $('<td class="metric-cell"></td>')
                        .css("background-color", Color.toString())
                        .css("color", d3.lab(Color).l > 70 ? "black" : "white")
                        .appendTo(Row)
                        .text(`${Currents.length}`)
                        .append(
                            $("<p></p>").text(d3.format(".0%")(Currents.length / Codes.length)),
                        );
                    $('<td class="number-cell actionable"></td>')
                        .appendTo(Row)
                        .text(`${Codes.length}`)
                        .append($("<p></p>").text("100%"));
                    // Generic click event
                    Row.children("td:not(.chunk-cell)").on("click", (Event: MouseEvent) =>
                        this.Visualizer.SetFilter(false, new ChunkFilter(), Key, Event.shiftKey),
                    );
                },
                ["Metadata", "Items", "Filtered", "Codes"],
            );
        });
    }
}
