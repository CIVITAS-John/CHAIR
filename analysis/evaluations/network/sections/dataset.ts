import d3 from 'd3';
import { Cash } from 'cash-dom';
import { Panel } from '../panels/panel.js';
import { Visualizer } from '../visualizer.js';

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
    /** Render: Render the panel. */
    public override Render() {
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
        this.Container.append($(`<h3>Datasets</h3>`));
        this.BuildTable(
            Object.entries(this.Source.Data), (Row, [Key, Value]) => {
                var Summary = $(`<td class="dataset-cell"></td>`).attr("id", `dataset-${Key}`).addClass("actionable").appendTo(Row);
                Summary.append($(`<p></p>`).append($(`<strong></strong>`).text(Key)));
                Summary.append($(`<p></p>`).text(`${Object.keys(Value).length} chunks, ${Object.values(Value).reduce((Sum, V) => Sum + V.Items, 0)} items`));
            }
        )
    }
}