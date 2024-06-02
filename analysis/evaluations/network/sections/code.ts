import d3 from 'd3';
import { Cash } from 'cash-dom';
import { Panel } from '../panels/panel.js';
import { Visualizer } from '../visualizer.js';
import { Code } from 'mongodb';

/** CodeSection: The code side panel. */
export class CodeSection extends Panel {
    /** Name: The short name of the panel. */
    public Name: string = "Codes";
    /** Title: The title of the panel. */
    public override Title: string = "Consolidated Codes";
    /** Constructor: Constructing the panel. */
    public constructor(Container: Cash, Visualizer: Visualizer) {
        super(Container, Visualizer);
        this.Visualizer = Visualizer;
        this.Container = $(`<div class="code"></div>`).appendTo(Container).hide();
    }
    /** Render: Render the panel. */
    public override Render() {
        this.Container.empty();
        // Some notes
        this.Container.append($(`<p class="tips"></p>`).text("Note that clusters are not deterministic, only to help understand the data. Names are chosen from the most connected codes."))
        // Show the components
        var Components = this.GetGraph<Code>().Components!;
        this.Container.append($(`<h3>${Components.length} Components</h3>`));
        this.BuildTable(Components, (Row, Component, Index) => {
        });
    }
}