import * as d3 from 'd3';
import { Code, CodebookComparison } from '../../../utils/schema.js';
import type { Cash, CashStatic, Element } from 'cash-dom';
declare global {
    var $: typeof Cash.prototype.init & CashStatic;
}

/** Visualizer: The visualization manager. */
export class Visualizer {
    /** Container: The container for the visualization. */
    private Container: Cash;
    /** Constructor: Constructing the manager. */
    public constructor(Container: Cash) {
        this.Container = Container;
        d3.json("network.json").then((Data) => {
            this.LoadDataset(Data as any);
        });
    }
    /** LoadDataset: Load the underlying network-based dataset. */
    public LoadDataset(Comparison: CodebookComparison) {
        
    }
}