import type { Cash } from "cash-dom";

import { CodeSection } from "../sections/code.js";
import { CodebookSection } from "../sections/codebook.js";
import { DatasetSection } from "../sections/dataset.js";
import { UserSection } from "../sections/user.js";
import type { Visualizer } from "../visualizer.js";

import { Panel } from "./panel.js";

/** The side panel for the visualizer. */
export class SidePanel extends Panel {
    /** The content container for the side panel. */
    #contents: Cash;
    /** The header of the side panel. */
    #header: Cash;
    /** The subpanels in the side panel. */
    #subpanels: Record<string, Panel> = {};

    /** Constructing the side panel. */
    constructor(container: Cash, visualizer: Visualizer) {
        super(container, visualizer);

        // Add the side panel
        this.container.find(".collapsable").on("click", () => {
            this.toggle();
        });
        this.#header = this.container.find(".panel-header h2");
        this.#contents = this.container.children(".content");

        // Add the subpanels
        const sections = [
            new DatasetSection(this.#contents, this.visualizer),
            new CodebookSection(this.#contents, this.visualizer),
            new CodeSection(this.#contents, this.visualizer),
            new UserSection(this.#contents, this.visualizer),
        ];
        for (const section of sections) {
            this.#subpanels[section.name] = section;
        }

        // Add the menu
        const menuContainer = this.#contents.children(".panel-menu");
        const buildMenu = (name: string) =>
            $(
                `<a href="javascript:void(0)" id="menu-${name}">${this.#subpanels[name].name}</a>`,
            ).on("click", () => this.showPanel(name));
        for (const key in this.#subpanels) {
            menuContainer.append(buildMenu(key));
        }

        // Show the tutorial
        menuContainer.append(
            $('<a href="javascript:void(0)" id="menu-tutorial">?</a>').on("click", () => {
                this.visualizer.tutorial.showTutorial(true);
            }),
        );
    }

    /** Show a side panel. */
    showPanel(name: string) {
        const panel = this.#subpanels[name];
        this.#header.text(panel.title);
        for (const key in this.#subpanels) {
            if (key === name) {
                this.#subpanels[key].show();
            } else {
                this.#subpanels[key].hide();
            }
        }
        $(`#menu-${this.currentPanel}`).toggleClass("chosen", false);
        $(`#menu-${name}`).toggleClass("chosen", true);
        this.currentPanel = name;
        return panel;
    }
    /** The current panel being shown. */
    currentPanel = "Datasets";
    /** Show the side panel. */
    override show() {
        this.container.toggleClass("collapsed", false);
        this.showPanel(this.currentPanel);
    }
    /** Hide the side panel. */
    override hide() {
        this.container.toggleClass("collapsed", true);
    }
    /** Render the panel. */
    override render() {
        this.#subpanels[this.currentPanel].render();
    }
    /** Toggle the side panel. */
    override toggle() {
        if (this.container.hasClass("collapsed")) {
            this.show();
        } else {
            this.hide();
        }
    }
}
