import type { Cash } from 'cash-dom';
import { Visualizer } from '../visualizer.js';
import { Panel } from './panel.js';
import { CodebookSection } from '../sections/codebook.js';
import { DatasetSection } from '../sections/dataset.js';
import { CodeSection } from '../sections/code.js';

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
        // Add the side panel
        this.Container.find(".collapsable").on("click", () => this.Toggle());
        this.Header = this.Container.find(".panel-header h2");
        this.Contents = this.Container.children(".content");
        // Add the subpanels
        this.Subpanels["dataset"] = new DatasetSection(this.Contents, this.Visualizer);
        this.Subpanels["codebook"] = new CodebookSection(this.Contents, this.Visualizer);
        this.Subpanels["code"] = new CodeSection(this.Contents, this.Visualizer);
        // Add the menu
        var MenuContainer = this.Contents.children(".panel-menu");
        var BuildMenu = (Name: string) => {
            return $(`<a href="javascript:void(0)" id="menu-${Name}">${this.Subpanels[Name].Name}</a>`)
                .on("click", () => this.ShowPanel(Name));
        };
        for (var Key in this.Subpanels)
            MenuContainer.append(BuildMenu(Key));
    }
    /** ShowPanel: Show a side panel. */
    public ShowPanel(Name: string) {
        var Panel = this.Subpanels[Name];
        this.Header.text(Panel.Title);
        for (var Key in this.Subpanels) {
            if (Key == Name) this.Subpanels[Key].Show();
            else this.Subpanels[Key].Hide();
        }
        $(`#menu-${this.CurrentPanel}`).toggleClass("chosen", false);
        $(`#menu-${Name}`).toggleClass("chosen", true);
        this.CurrentPanel = Name;
    }
    /** CurrentPanel: The current panel being shown. */
    public CurrentPanel: string = "dataset";
    /** Show: Show the side panel. */
    public Show() {
        this.Container.toggleClass("collapsed", false);
        this.ShowPanel(this.CurrentPanel)
    }
    /** Hide: Hide the side panel. */
    public Hide() {
        this.Container.toggleClass("collapsed", true);
    }
    /** Render: Render the panel. */
    public Render() {
        this.Subpanels[this.CurrentPanel].Render();
    }
    /** Toggle: Toggle the side panel. */
    public Toggle() {
        if (this.Container.hasClass("collapsed")) this.Show();
        else this.Hide();
    }
}