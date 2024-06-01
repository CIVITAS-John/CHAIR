import { Cash } from "cash-dom";
import { Visualizer } from "../visualizer";

/** Panel: A panel for the visualizer. */
export abstract class Panel {
    /** Title: The title of the panel. */
    public Title: string = "";
    /** Visualizer: The visualizer in-use. */
    protected Visualizer: Visualizer;
    /** Container: The container for the side panel. */
    protected Container: Cash;
    /** Dataset: The dataset of the visualizer. */
    protected get Dataset() { return this.Visualizer.Dataset; }
    /** InfoPanel: The information panel for the visualization. */
    protected get InfoPanel() { return this.Visualizer.InfoPanel; }
    /** SidePanel: The side panel for the visualization. */
    protected get SidePanel() { return this.Visualizer.SidePanel; }
    /** Dialog: Dialog for the visualization. */
    protected get Dialog() { return this.Visualizer.Dialog; }
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
}