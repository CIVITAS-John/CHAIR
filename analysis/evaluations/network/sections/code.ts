import d3 from 'd3';
import { Cash } from 'cash-dom';
import { Panel } from '../panels/panel.js';
import { Visualizer } from '../visualizer.js';
import { Code } from '../../../../utils/schema.js';
import { FilterNodesByOwner } from '../utils/graph.js';
import { GetCodebookColor } from '../utils/utils.js';

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
        this.Container.append($(`<h3>${Components.length} Clusters</h3>`));
        this.BuildTable(Components, (Row, Component, Index) => {
            // Show the summary
            var Summary = $(`<td class="cluster-cell"></td>`).attr("id", `cluster-${Index}`).addClass("actionable").appendTo(Row);
            Summary.append($(`<h4></h4>`).text(`#${Index + 1} ${Component.Representative!.Data.Label}`));
            // Calculate the coverage of each codebook
            var Codebooks: Map<number, number> = this.Dataset.Names.reduce((Previous, Name, Index) => {
                Previous.set(Index, FilterNodesByOwner(Component.Nodes, Index, this.Parameters.UseNearOwners).length);
                return Previous;
            }, new Map<number, number>());
            // Show the owners
            var Owners = $(`<p class="owners"></p>`).appendTo(Summary);
            this.Dataset.Names.forEach((Name, Index) => {
                var Count = Codebooks.get(Index)!;
                if (Index == 0 || Count == 0) return;
                Owners.append($(`<a href="javascript:void(0)" style="color: ${GetCodebookColor(Index, this.Dataset.Codebooks.length)}">${this.Dataset.Names[Index]}</a>`)
                    .attr("title", `${Count} codes (${d3.format(".0%")(Count / Component.Nodes.length)})`));
            });
            // Show the numbers
            $(`<td class="number-cell actionable"></td>`).appendTo(Row).text(`${Component.Nodes.length}`).append($(`<p></p>`).text(`100%`));
            var Filtered = Component.Nodes.filter(Node => !Node.Hidden).length;
            $(`<td class="number-cell actionable"></td>`).appendTo(Row).text(`${Filtered}`).append($(`<p></p>`).text(d3.format(".0%")(Filtered / Component.Nodes.length)));
        }, ["Cluster", "Total", "Filtered"]);
    }
}