import type { Cash } from "cash-dom";

import type { Visualizer } from "../visualizer.js";

/** Panel: A panel for the visualizer. */
export abstract class Panel {
    /** The short name of the panel. */
    name = "";
    /** The title of the panel. */
    title = "";
    /** The codebook dataset of the visualizer. */
    protected get dataset() {
        return this.visualizer.dataset;
    }
    /** The source dataset of the visualizer. */
    protected get source() {
        return this.visualizer.dataset.source;
    }
    /** The information panel for the visualization. */
    protected get infoPanel() {
        return this.visualizer.infoPanel;
    }
    /** The side panel for the visualization. */
    protected get sidePanel() {
        return this.visualizer.sidePanel;
    }
    /** Dialog for the visualization. */
    protected get dialog() {
        return this.visualizer.dialog;
    }
    /** The parameters of the visualizer. */
    protected get parameters() {
        return this.visualizer.parameters;
    }
    /** The current graph of the visualizer. */
    protected getGraph<T>() {
        return this.visualizer.getStatus<T>().graph;
    }

    /** Constructing the side panel. */
    constructor(
        /** The container for the side panel. */
        protected container: Cash,
        /** The visualizer in-use. */
        protected visualizer: Visualizer,
    ) {}

    /** Show the panel. */
    show() {
        this.container.show();
        this.render();
    }
    /** Hide the panel. */
    hide() {
        this.container.hide();
    }
    /** Toggle the panel. */
    toggle() {
        this.container.toggle();
    }
    /** Render the panel. */
    render() {
        this.refresh();
    }

    /** The current program that actually renders the panel. Optional. */
    protected refresh: () => void = () => {
        // This method is intentionally left empty
    };
    /** Set the refresh function for the panel. */
    protected setRefresh(refresh: () => void) {
        this.refresh = refresh;
        refresh();
    }

    /** Build a table for the panel. */
    protected buildTable<T>(
        data: T[],
        builder: (row: Cash, data: T, idx: number) => void,
        columns: string[] = [],
    ) {
        const table = $('<table class="data-table"></table>').appendTo(this.container);
        if (columns.length > 0) {
            table.append($("<tr></tr>").append(...columns.map((c) => $("<th></th>").text(c))));
        }
        data.forEach((item, idx) => {
            builder($("<tr></tr>").appendTo(table), item, idx);
        });
        return table;
    }

    /** Build a list for the panel. */
    protected buildList<T>(
        data: T[],
        builder: (item: Cash, data: T, idx: number) => void,
        type: "ul" | "ol" = "ul",
    ) {
        const list = $(`<${type}></${type}>`).appendTo(this.container);
        data.forEach((item, idx) => {
            builder($("<li></li>").appendTo(list), item, idx);
        });
        return list;
    }

    /** Build a return button. */
    protected buildReturn(callback: () => void) {
        return $('<a href="javascript:void(0)">↑</a>').on("click", callback);
    }
}
