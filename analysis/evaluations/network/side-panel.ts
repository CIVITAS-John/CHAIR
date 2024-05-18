import type { Cash } from 'cash-dom';
import { Visualizer } from './visualizer.js';

/** SidePanel: The side panel for the visualizer. */
export class SidePanel {
    /** Visualizer: The visualizer in-use. */
    private Visualizer: Visualizer;
    /** Container: The container for the side panel. */
    private Container: Cash;
    /** Constructor: Constructing the side panel. */
    public constructor(Container: Cash, Visualizer: Visualizer) {
        this.Visualizer = Visualizer;
        this.Container = Container;
        this.Container.find(".collapsable").on("click", () => {
            this.Container.toggleClass("collapsed");
        });
    }
}