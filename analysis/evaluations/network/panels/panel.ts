import { Cash } from "cash-dom";
import { Visualizer } from "../visualizer.js";

/** Panel: A panel for the visualizer. */
export abstract class Panel {
    /** Name: The short name of the panel. */
    public Name: string = "";
    /** Title: The title of the panel. */
    public Title: string = "";
    /** Visualizer: The visualizer in-use. */
    protected Visualizer: Visualizer;
    /** Container: The container for the side panel. */
    protected Container: Cash;
    /** Dataset: The codebook dataset of the visualizer. */
    protected get Dataset() { return this.Visualizer.Dataset; }
    /** Source: The source dataset of the visualizer. */
    protected get Source() { return this.Visualizer.Dataset.Source; }
    /** InfoPanel: The information panel for the visualization. */
    protected get InfoPanel() { return this.Visualizer.InfoPanel; }
    /** SidePanel: The side panel for the visualization. */
    protected get SidePanel() { return this.Visualizer.SidePanel; }
    /** Dialog: Dialog for the visualization. */
    protected get Dialog() { return this.Visualizer.Dialog; }
    /** Graph: The current graph of the visualizer. */
    protected GetGraph<T>() { return this.Visualizer.GetStatus<T>().Graph; }
    /** Constructor: Constructing the side panel. */
    public constructor(Container: Cash, Visualizer: Visualizer) {
        this.Visualizer = Visualizer;
        this.Container = Container;
    }
    /** Show: Show the panel. */
    public Show() {
        this.Container.show();
        this.Render();
    }
    /** Hide: Hide the panel. */
    public Hide() {
        this.Container.hide();
    }
    /** Toggle: Toggle the panel. */
    public Toggle() {
        this.Container.toggle();
    }
    /** Render: Render the panel. */
    public Render() { }
    /** BuildTable: Build a table for the panel. */
    protected BuildTable<T>(Data: T[], Builder: (Row: Cash, Data: T, Index: number) => void, Columns: string[] = []) {
        var Table = $(`<table></table>`).appendTo(this.Container);
        if (Columns.length > 0)
            Table.append($(`<tr></tr>`).append(...Columns.map(C => $(`<th></th>`).text(C))));
        Data.forEach((Item, Index) => Builder($(`<tr></tr>`).appendTo(Table), Item, Index));
        return Table;
    }
    /** BuildList: Build a list for the panel. */
    protected BuildList<T>(Data: T[], Builder: (Item: Cash, Data: T, Index: number) => void, Type: "ul" | "ol" = "ul") {
        var List = $(`<${Type}></${Type}>`).appendTo(this.Container);
        Data.forEach((Item, Index) => Builder($(`<li></li>`).appendTo(List), Item, Index));
        return List;
    }
}