import type { Cash } from 'cash-dom';
import { Visualizer } from '../visualizer.js';
import { Panel } from './panel.js';
import { Evaluator } from '../sections/evaluator.js';

/** SidePanel: The side panel for the visualizer. */
export class SidePanel extends Panel {
    /** Contents: The content container for the side panel. */
    private Contents: Cash;
    /** Header: The header of the side panel. */
    private Header: Cash;
    /** Subpanels: The subpanels in the side panel. */
    private Subpanels: Record<string, Panel> = {};
    /** Constructor: Constructing the side panel. */
    public constructor(Container: Cash, Visualizer: Visualizer) {
        super(Container, Visualizer);
        this.Container.find(".collapsable").on("click", () => this.Toggle());
        this.Header = this.Container.children(".panel-header");
        this.Contents = this.Container.children(".content");
        this.Subpanels["evaluator"] = new Evaluator(this.Contents, this.Visualizer);
    }
    /** ShowPanel: Show a side panel. */
    public ShowPanel(Name: string) {
        var Panel = this.Subpanels[Name];
        this.Header.children("h2").text(Panel.Title);
        for (var Key in this.Subpanels) {
            if (Key == Name) this.Subpanels[Key].Show();
            else this.Subpanels[Key].Hide();
        }
    }
    /** Show: Show the side panel. */
    public Show() {
        this.Container.toggleClass("collapsed", false);
        this.ShowPanel("evaluator")
    }
    /** Hide: Hide the side panel. */
    public Hide() {
        this.Container.toggleClass("collapsed", true);
    }
    /** Toggle: Toggle the side panel. */
    public Toggle() {
        if (this.Container.hasClass("collapsed")) this.Show();
        else this.Hide();
    }
}