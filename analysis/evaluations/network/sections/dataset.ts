import d3 from 'd3';
import { Cash } from 'cash-dom';
import { Panel } from '../panels/panel.js';
import { Visualizer } from '../visualizer.js';
import { Code, DataChunk, DataItem } from '../../../../utils/schema.js';
import { FilterNodeByExample } from '../utils/graph.js';
import { FormatDate } from '../utils/utils.js';
import { ChunkFilter, DatasetFilter } from '../utils/filters.js';

/** DatasetSection: The dataset side panel. */
export class DatasetSection extends Panel {
    /** Name: The short name of the panel. */
    public Name: string = "Datasets";
    /** Title: The title of the panel. */
    public override Title: string = "Dataset Overview";
    /** Constructor: Constructing the panel. */
    public constructor(Container: Cash, Visualizer: Visualizer) {
        super(Container, Visualizer);
        this.Visualizer = Visualizer;
        this.Container = $(`<div class="dataset"></div>`).appendTo(Container).hide();
    }
    /** Show: Show the panel. */
    public override Show() {
        this.Container.show();
        this.ShowDatasets();
    }
    /** RatioColorizer: The colorizer for ratios. */
    private RatioColorizer = d3.scaleSequential()
        .interpolator(d3.interpolateViridis).domain([0, 1]);
    /** ShowDatasets: Show all datasets. */
    public ShowDatasets() {
        this.SetRefresh(() => {
            this.Container.empty();
            // Basic information
            this.Container.append($(`<h3>Metadata</h3>`));
            this.BuildList([
                { Name: "Title", Value: this.Source.Title },
                { Name: "Description", Value: this.Source.Description },
                { Name: "Research Question", Value: this.Source.ResearchQuestion },
                { Name: "Notes for Coding", Value: this.Source.CodingNotes }
            ], (Item, Data) => {
                Item.append($(`<strong>${Data.Name}:</strong>`));
                Item.append($(`<span></span>`).text(Data.Value));
            }).appendTo(this.Container);
            // Source datasets
            var Nodes = this.GetGraph<Code>().Nodes;
            this.Container.append($(`<h3>Datasets</h3>`));
            this.BuildTable(
                Object.entries(this.Source.Data), (Row, [Key, Value]) => {
                    // Interactivity
                    Row.toggleClass("chosen", this.Visualizer.IsFilterApplied("Dataset", Key))
                        .on("mouseover", (Event) => this.Visualizer.SetFilter(true, new DatasetFilter(), Key))
                        .on("mouseout", (Event) => this.Visualizer.SetFilter(true, new DatasetFilter()));
                    // Show the summary
                    var Summary = $(`<td class="dataset-cell actionable"></td>`).attr("id", `dataset-${Key}`).appendTo(Row);
                    Summary.append($(`<h4></h4>`).text(Key))
                        .on("click", (Event) => {
                            if (Event.shiftKey)
                                this.Visualizer.SetFilter(false, new DatasetFilter(), Key, Event.shiftKey);
                            else this.ShowDataset(Key, Value);
                        });
                    // Find the date
                    var Dates = Object.values(Value).flatMap(V => V.AllItems ?? []).map(Item => Item.Time).sort((A, B) => A.getTime() - B.getTime());
                    Summary.append($(`<p class="tips"></p>`).text(`From ${FormatDate(Dates[0])}`));
                    Summary.append($(`<p class="tips"></p>`).text(`To ${FormatDate(Dates[Dates.length - 1])}`));
                    // Show the items
                    var IDs = new Set(Object.values(Value).flatMap(V => V.AllItems ?? []).map(Item => Item.ID));
                    var SizeCell = $(`<td class="number-cell actionable"></td>`).text(`${IDs.size}`).appendTo(Row);
                    SizeCell.append($(`<p class="tips"></p>`).text(`${Object.keys(Value).length} Chunks`));
                    // Show the codes
                    var Codes = Nodes.filter((Node) => FilterNodeByExample(Node, Array.from(IDs)));
                    var Currents = Codes.filter((Node) => !Node.Hidden);
                    var Color = this.RatioColorizer(Currents.length / Codes.length);
                    $(`<td class="metric-cell"></td>`)
                        .css("background-color", Color.toString())
                        .css("color", d3.lab(Color).l > 70 ? "black" : "white")
                        .appendTo(Row).text(`${Currents.length}`).append($(`<p></p>`).text(d3.format(".0%")(Currents.length / Codes.length)));
                    $(`<td class="number-cell actionable"></td>`).appendTo(Row).text(`${Codes.length}`).append($(`<p></p>`).text(`100%`));
                    // Generic click event
                    Row.children("td:not(.dataset-cell)")
                        .on("click", (Event) => this.Visualizer.SetFilter(false, new DatasetFilter(), Key, Event.shiftKey));
                }, ["Metadata", "Items", "Filtered", "Total"]
            );
        });
    }
    /** ShowDataset: Show a specific dataset. */
    public ShowDataset(Name: string, Dataset: Record<string, DataChunk<DataItem>>) {
        // Filter by the dataset, if not already
        if (!this.Visualizer.IsFilterApplied("Dataset", Name))
            this.Visualizer.SetFilter(false, new DatasetFilter(), Name);
        // Show the component
        this.SetRefresh(() => {
            var Colorizer = this.Visualizer.GetColorizer();
            this.Container.empty();
            // Show the title
            this.Container.append($(`<h3>${Name} (${Object.keys(Dataset).length} Chunks)</h3>`)
                .prepend(this.BuildReturn(() => {
                    if (this.Visualizer.IsFilterApplied("Dataset", Name))
                        this.Visualizer.SetFilter(false, new DatasetFilter());
                    this.ShowDatasets();
                })));
            // Show the chunks
            var Nodes = this.GetGraph<Code>().Nodes;
            this.BuildTable(Object.entries(Dataset), (Row, [Key, Chunk], Index) => {
                // Interactivity
                Row.toggleClass("chosen", this.Visualizer.IsFilterApplied("Chunk", Key))
                    .on("mouseover", (Event) => this.Visualizer.SetFilter(true, new ChunkFilter(), Key))
                    .on("mouseout", (Event) => this.Visualizer.SetFilter(true, new ChunkFilter()));
                // Show the summary
                var Summary = $(`<td class="chunk-cell actionable"></td>`).attr("id", `chunk-${Key}`).appendTo(Row);
                Summary.append($(`<h4></h4>`).text(`Chunk ${Key}`));
                // Find the date
                var Dates = (Chunk.AllItems ?? []).map(Item => Item.Time).sort((A, B) => A.getTime() - B.getTime());
                Summary.append($(`<p class="tips"></p>`).text(`From ${FormatDate(Dates[0])}`));
                Summary.append($(`<p class="tips"></p>`).text(`To ${FormatDate(Dates[Dates.length - 1])}`));
                // Show the items
                $(`<td class="number-cell actionable"></td>`).text((Chunk.AllItems?.length ?? 0).toString()).appendTo(Row);
                // Show the codes
                var Codes = Nodes.filter((Node) => FilterNodeByExample(Node, Chunk.AllItems?.map(Item => Item.ID) ?? []));
                var Currents = Codes.filter((Node) => !Node.Hidden);
                var Color = this.RatioColorizer(Currents.length / Codes.length);
                $(`<td class="metric-cell"></td>`)
                    .css("background-color", Color.toString())
                    .css("color", d3.lab(Color).l > 70 ? "black" : "white")
                    .appendTo(Row).text(`${Currents.length}`).append($(`<p></p>`).text(d3.format(".0%")(Currents.length / Codes.length)));
                $(`<td class="number-cell actionable"></td>`).appendTo(Row).text(`${Codes.length}`).append($(`<p></p>`).text(`100%`));
                // Generic click event
                Row.children("td:not(.chunk-cell)")
                    .on("click", (Event) => this.Visualizer.SetFilter(false, new ChunkFilter(), Key, Event.shiftKey));
            }, ["Metadata", "Items", "Filtered", "Total"]);
        });
    }
}