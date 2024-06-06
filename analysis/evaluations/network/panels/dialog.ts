import type { Cash } from 'cash-dom';
import { Visualizer } from '../visualizer.js';
import { Code, DataChunk, DataItem } from '../../../../utils/schema.js';
import { FormatDate, GetCodebookColor } from '../utils/utils.js';
import { Panel } from './panel.js';
import { GetChunks } from '../utils/dataset.js';

/** Dialog: The dialog for the visualizer. */
export class Dialog extends Panel {
    /** Constructor: Constructing the dialog. */
    public constructor(Container: Cash, Visualizer: Visualizer) {
        super(Container, Visualizer);
        Container.children("div.close").on("click", () => this.Hide());
    }
    /** ShowPanel: Show a panel in the dialog. */
    private ShowPanel(Panel: Cash) {
        var Content = this.Container.children("div.content");
        Content.children().remove();
        Content.append(Panel);
        this.Show();
    }
    /** ShowCode: Show a dialog for a code. */
    public ShowCode(Owner: number, Original: Code, ...Codes: Code[]) {
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
        if (!IsBaseline)
            Panel.children("h3").prepend($(`<a href="javascript:void(0)" class="back">↑</a>`)
                .attr("title", Original.Label).on("click", () => { this.ShowCode(0, Original); }));
        // Show the dialog
        this.ShowPanel(Panel);
    }
    /** ShowChunk: Show a dialog for a chunk. */
    public ShowChunk(Name: string, Chunk: DataChunk<DataItem>) {
        // Build the panel
        var Panel = $(`<div class="panel"></div>`);
        // Add the title
        Panel.append($(`<h3>Chunk ${Name} (${Chunk.AllItems?.length} Items)</h3>`));
        Panel.append($(`<hr/>`));
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
            var Content = $(`<p></p>`).text(Item.Content).appendTo(Current);

        }
        // Show the dialog
        this.ShowPanel(Panel);
    }
    /** ShowChunkOf: Show a dialog for a chunk based on the content ID. */
    public ShowChunkOf(ID: string) {
        var Chunks = GetChunks(this.Dataset.Source.Data);
    }
}