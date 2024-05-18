import type { Cash } from 'cash-dom';
import { Visualizer } from './visualizer.js';

/** InfoPanel: The info panel for the visualizer. */
export class InfoPanel {
    /** Visualizer: The visualizer in-use. */
    private Visualizer: Visualizer;
    /** Container: The container for the side panel. */
    private Container: Cash;
    /** Constructor: Constructing the side panel. */
    public constructor(Container: Cash, Visualizer: Visualizer) {
        this.Visualizer = Visualizer;
        this.Container = Container;
    }
}