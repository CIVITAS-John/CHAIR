import d3 from 'd3';
import { Cash } from 'cash-dom';
import { Panel } from '../panels/panel.js';
import { Visualizer } from '../visualizer.js';
import { Code, DataChunk, DataItem } from '../../../../utils/schema.js';
import { FilterNodeByExample } from '../utils/graph.js';
import { FormatDate } from '../utils/utils.js';

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
                    // Show the summary
                    var Summary = $(`<td class="dataset-cell actionable"></td>`).attr("id", `dataset-${Key}`).appendTo(Row);
                    Summary.append($(`<h4></h4>`).text(Key));
                    // Find the date
                    var Dates = Object.values(Value).flatMap(V => V.AllItems ?? []).map(Item => Item.Time).sort();
                    Summary.append($(`<p class="tips"></p>`).text(`From ${FormatDate(Dates[0])}`));
                    Summary.append($(`<p class="tips"></p>`).text(`To ${FormatDate(Dates[Dates.length - 1])}`));
                    // Show the details
                    var IDs = Object.values(Value).flatMap(V => V.AllItems ?? []).map(Item => Item.ID);
                    var SizeCell = $(`<td class="actionable"></td>`).appendTo(Row);
                    SizeCell.append($(`<p></p>`).text(`${Object.keys(Value).length} Chunks`));
                    SizeCell.append($(`<p></p>`).text(`${IDs.length} Items`));
                    // Show the codes
                    var Codes = Nodes.filter((Node) => FilterNodeByExample(Node, IDs));
                    var CodeCell = $(`<td class="actionable"></td>`).appendTo(Row);
                    CodeCell.append($(`<p></p>`).text(`${Codes.length} Codes`));
                    CodeCell.append($(`<p></p>`).text(`${Codes.filter(Node => !Node.Hidden).length} Filtered`));
                }, ["Name", "Data", "Codes"]
            );
        });
    }
    /** ShowDataset: Show a specific dataset. */
    public ShowDataset(Name: string, Dataset: Record<string, DataChunk<DataItem>>) {
        // Show the component
        this.SetRefresh(() => {
            var Colorizer = this.Visualizer.GetColorizer();
            this.Container.empty();
            // Show the title
            this.Container.append($(`<h3>${Name} (${Object.keys(Dataset).length} Chunks)}</h3>`)
                .prepend(this.BuildReturn(() => {
                    this.ShowDatasets();
                })));
            // Show the chunks
            var Nodes = this.GetGraph<Code>().Nodes;
            this.BuildTable(Object.entries(Dataset), (Row, [Key, Chunk], Index) => {
                
                // Show the codes
                var Codes = Nodes.filter((Node) => FilterNodeByExample(Node, Object.values(Chunk.AllItems ?? []).map(Item => Item.ID)));
                var CodeCell = $(`<td class="number-cell actionable"></td>`).appendTo(Row);
                CodeCell.append($(`<p class="tips"></p>`).text(`${Codes.length} Codes`));
                CodeCell.append($(`<p class="tips"></p>`).text(`${Codes.filter(Node => !Node.Hidden).length} Filtered`));
            }, ["#", "Date", "Items", "Codes"]);
        });
    }
}