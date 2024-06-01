import type { Cash } from 'cash-dom';
import { Visualizer } from '../visualizer.js';
import { Node } from '../utils/schema.js';
import { Code } from '../../../../utils/schema.js';
import { GetCodebookColor } from '../utils/utils.js';
import { Panel } from './panel.js';
import { ExtractExamples, FindExampleSources, FindOriginalCodes } from '../utils/dataset.js';

/** Dialog: The dialog for the visualizer. */
export class Dialog extends Panel {
    /** Constructor: Constructing the dialog. */
    public constructor(Container: Cash, Visualizer: Visualizer) {
        super(Container, Visualizer);
        Container.children("div.close").on("click", () => this.Hide());
    }
    /** ShowDialogForCode: Show a dialog for a code. */
    public ShowDialogForCode(Owner: number, Original: Code, ...Codes: Code[]) {
        var IsBaseline = Owner == 0;
        if (Codes.length == 0) Codes.push(Original);
        // Build the panel
        var Panel = $(`<div class="panel"></div>`);
        for (var Code of Codes) {
            if (Panel.children().length > 0) $("<hr>").appendTo(Panel);
            this.InfoPanel.BuildPanelForCode(Panel, Code, true);
        }
        Panel.children("h3").append($(`<span style="color: ${GetCodebookColor(Owner, this.Dataset.Codebooks.length)}">${this.Visualizer.Dataset.Names[Owner]}</span>`));
        // Add a back button if it's not the baseline
        if (!IsBaseline)
            Panel.children("h3").prepend($(`<a href="javascript:void(0)" class="back">↑</a>`)
                .attr("title", Original.Label).on("click", () => {
                    this.ShowDialogForCode(0, Original);
                }));
        // Show the dialog
        var Content = this.Container.children("div.content");
        Content.children().remove();
        Content.append(Panel);
        this.Show();
    }
}