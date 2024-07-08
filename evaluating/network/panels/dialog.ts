import d3 from 'd3';
import type { Cash } from 'cash-dom';
import { Visualizer } from '../visualizer.js';
import { Code, DataChunk, DataItem } from '../../../utils/schema.js';
import { FormatDate, GetCodebookColor } from '../utils/utils.js';
import { Panel } from './panel.js';
import { FindOriginalCodes, GetChunks } from '../utils/dataset.js';
import { FilterNodeByExample, FilterNodeByOwners } from '../utils/graph.js';
import { EvaluatePerCluster } from '../utils/evaluate.js';

/** Dialog: The dialog for the visualizer. */
export class Dialog extends Panel {
    /** Constructor: Constructing the dialog. */
    public constructor(Container: Cash, Visualizer: Visualizer) {
        super(Container, Visualizer);
        Container.children("div.close").on("click", () => this.Hide());
    }
    /** ShowPanel: Show a panel in the dialog. */
    private ShowPanel(Panel: Cash) {
        // Add a back button
        $(`<a class="back" href="javascript:void(0)">⮜</a>`)
            .on("click", () => window.history.back())
            .prependTo(Panel.children("h3"));
        // Show the panel
        var Content = this.Container.children("div.content");
        Content.children().remove();
        Content.append(Panel);
        this.Show();
    }
    /** ShowCode: Show a dialog for a code. */
    public ShowCode(Owner: number, Original: Code, ...Codes: Code[]) {
        this.Visualizer.PushState(`code-${encodeURIComponent(Original.Label)}-${Owner}`, () => this.ShowCode(Owner, Original, ...Codes));
        // Check if it's the baseline
        var IsBaseline = Owner == 0;
        if (Codes.length == 0) Codes.push(Original);
        // Build the panel
        var Panel = $(`<div class="panel"></div>`);
        for (var Code of Codes) {
            if (Panel.children().length > 0) $("<hr>").appendTo(Panel);
            this.InfoPanel.BuildPanelForCode(Panel, Code, true);
        }
        Panel.children("h3").append($(`<span style="color: ${GetCodebookColor(Owner, this.Dataset.Codebooks.length)}">${this.Dataset.Names[Owner]}</span>`));
        // Add a back button if it's not the baseline
        if (!IsBaseline) {
            var Source = $(`<p>Consolidated into: <a href="javascript:void(0)" class="back">←</a></p>`);
            Source.children("a").text(Original.Label).on("click", () => { this.ShowCode(0, Original); });
            Panel.children("h3").after(Source);
        }
        // Show the dialog
        this.ShowPanel(Panel);
    }
    /** ShowChunk: Show a dialog for a chunk. */
    public ShowChunk(Name: string, Chunk: DataChunk<DataItem>, Owners: number[] = []) {
        this.Visualizer.PushState(`chunk-${Name}`, () => this.ShowChunk(Name, Chunk, Owners));
        // Build the panel
        var Panel = $(`<div class="panel"></div>`);
        // Add the title
        Panel.append($(`<h3>Chunk ${Name} (${Chunk.AllItems?.length} Items)</h3>`));
        Panel.append($(`<hr/>`));
        var Codes = this.GetGraph<Code>().Nodes;
        // Show the items
        var List = $(`<ol class="quote"></ol>`).appendTo(Panel);
        var Items = Chunk.AllItems ?? [];
        var Orthodox = Items[0].Chunk == Name;
        if (Orthodox) $(`<li class="split">Items inside the chunk:</li>`).prependTo(List);
        for (var Item of Items) {
            // Show divisors when needed
            if (Item.Chunk == Name != Orthodox) {
                $("<hr>").appendTo(List);
                if (!Orthodox) {
                    $(`<li class="split">Items before the chunk:</li>`).prependTo(List);
                    $(`<li class="split">Items inside the chunk:</li>`).appendTo(List);
                } else $(`<li class="split">Items after the chunk:</li>`).appendTo(List);
                Orthodox = !Orthodox;
            }
            // Show the item
            var Current = $(`<li class="custom"></li>`).attr("seq", Item.ID).appendTo(List);
            var Header = $(`<p><strong></strong> at <i></i></p>`).appendTo(Current);
            Header.children("strong").text(Item.Nickname);
            Header.children("i").text(FormatDate(Item.Time));
            $(`<p></p>`).text(Item.Content).appendTo(Current);
            // Show related codes
            var Examples = Codes.filter((Node) => FilterNodeByExample(Node, [Item.ID]));
            Examples = Examples.filter((Node) => Owners.length == 0 || FilterNodeByOwners(Node, Owners, this.Parameters.UseNearOwners));
            if (Owners.length == 1) {
                $(`<p class="codes">Coded as:<span></span></p>`).appendTo(Current)
                    .children("span").text(Examples.map(Code => Code.Data.Label).join(", "));
            } else {
                var CodeList = $(`<ol class="codes"></ol>`).appendTo(Current);
                var CodeItems: Cash[] = [];
                // Show the codes
                for (var Code of Examples) {
                    var CodeItem = $(`<li class="owners"><i></i> from </li>`);
                    CodeItem.children("i").text(Code.Data.Label)
                        .css("cursor", "pointer")
                        .on("click", () => this.ShowCode(0, Code.Data));
                    // Show the owners
                    var RealOwners = 0;
                    for (var Owner of Code.Data.Owners!) {
                        if (Owner == 0) continue;
                        var Originals = FindOriginalCodes(this.Dataset.Codebooks[Owner], Code.Data, Owner, Item.ID);
                        // Only show the owner if the code is related to THIS quote
                        if (Originals.length > 0) {
                            this.InfoPanel.BuildOwnerLink(Code.Data, Originals, Owner).appendTo(CodeItem);
                            RealOwners++;
                        }
                    }
                    CodeItem.data("owners", RealOwners);
                    // Only show the code if it has owners
                    if (RealOwners > 0) CodeItems.push(CodeItem);
                }
                // Sort the codes by the number of owners
                CodeItems.sort((A, B) => parseInt(B.data("owners")) - parseInt(A.data("owners")));
                CodeItems.forEach(Item => Item.appendTo(CodeList));
            }
        }
        // Show the dialog
        this.ShowPanel(Panel);
    }
    /** ShowChunkOf: Show a dialog for a chunk based on the content ID. */
    public ShowChunkOf(ID: string) {
        var Chunks = GetChunks(this.Dataset.Source.Data);
        var Chunk = Chunks.find(Chunk => Chunk.AllItems?.find(Item => Item.ID == ID && Item.Chunk == Chunk.ID));
        if (Chunk) this.ShowChunk(Chunk.ID, Chunk);
    }
    /** CompareCoverageByClusters: Compare the coverage by clusters. */
    public CompareCoverageByClusters() {
        this.Visualizer.PushState(`compare-coverage-by-clusters`, () => this.CompareCoverageByClusters());
        // Build the panel
        var Panel = $(`<div class="panel"></div>`);
        // Add the title
        Panel.append($(`<h3>Codebook Coverage by Clusters</h3>`));
        Panel.append($(`<hr/>`));
        // Evaluate the coverage
        var Graph = this.GetGraph<Code>();
        var Results = EvaluatePerCluster(this.Dataset, Graph, this.Parameters);
        var Minimum = d3.min(Results.flatMap(Result => Result.Coverages))!;
        var Maximum = d3.max(Results.flatMap(Result => Result.Coverages))!;
        var Colors = d3.scaleSequential()
                    .interpolator(d3.interpolateViridis)
                    .domain([Maximum, Minimum]);
        // Build the table
        this.BuildTable(
            Results, (Row, {Name, Coverages}, Index) => {
                Row.append($(`<td>${Name}</td>`));
                for (var Coverage of Coverages) {
                    var Color = Colors(Coverage);
                    var Cell = $(`<td class="metric-cell"></td>`)
                        .text(d3.format(".1%")(Coverage))
                        .css("background", Color)
                        .css("color", d3.lab(Color).l > 70 ? "black" : "white");
                    Row.append(Cell);
                }
            }, ["Codebook", ...Graph.Components!.map(Component => Component.Representative!.Data.Label)]
        ).appendTo(Panel);
        // Show the dialog
        this.ShowPanel(Panel);
    }
}