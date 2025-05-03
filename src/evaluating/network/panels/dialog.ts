import type { Cash } from "cash-dom";
import d3 from "d3";

import type { Code, DataChunk, DataItem } from "../../../schema.js";
import type { CodeSection } from "../sections/code.js";
import { findOriginalCodes, getChunks } from "../utils/dataset.js";
import { evaluatePerCluster } from "../utils/evaluate.js";
import { OwnerFilter } from "../utils/filters.js";
import { filterItemByUser } from "../utils/graph.js";
import { seededShuffle } from "../utils/math.js";
import { renderExamples, renderItem } from "../utils/render.js";
import { getCodebookColor } from "../utils/utils.js";
import type { Visualizer } from "../visualizer.js";

import { Panel } from "./panel.js";

/** The dialog for the visualizer. */
export class Dialog extends Panel {
    /** Constructing the dialog. */
    constructor(container: Cash, visualizer: Visualizer) {
        super(container, visualizer);
        container.children("div.close").on("click", () => {
            this.hide();
        });
    }

    /** Show a panel in the dialog. */
    #showPanel(panel: Cash) {
        // Add a back button
        $('<a class="back" href="javascript:void(0)">⮜</a>')
            .on("click", () => {
                window.history.back();
            })
            .prependTo(panel.children("h3"));
        // Show the panel
        const content = this.container.children("div.content");
        const ele = content.get(0);
        if (ele) ele.scrollTop = 0;
        content.children().remove();
        content.append(panel);
        this.show();
    }

    /** Show a dialog for a code. */
    showCode(owner: number, original: Code, ...codes: Code[]) {
        this.visualizer.pushState(`code-${encodeURIComponent(original.label)}-${owner}`, () => {
            this.showCode(owner, original, ...codes);
        });
        // Check if it's the baseline
        const isBaseline = owner === 0;
        if (codes.length === 0) {
            codes.push(original);
        }
        // Build the panel
        const panel = $('<div class="panel"></div>');
        for (const code of codes) {
            if (panel.children().length > 0) {
                $("<hr>").appendTo(panel);
            }
            this.infoPanel.buildPanelForCode(panel, code, true);
        }
        panel
            .children("h3")
            .append(
                $(
                    `<span style="color: ${getCodebookColor(owner, this.dataset.codebooks.length)}">${this.dataset.names[owner]}</span>`,
                ),
            );
        // Add a back button if it's not the baseline
        if (!isBaseline) {
            const source = $(
                '<p>Consolidated into: <a href="javascript:void(0)" class="back">←</a></p>',
            );
            source
                .children("a")
                .text(original.label)
                .on("click", () => {
                    this.showCode(0, original);
                });
            panel.children("h3").after(source);
        }
        // Show the dialog
        this.#showPanel(panel);
    }

    /** Show a dialog for a user. */
    showUser(id: string, owners: number[] = [], scrollTo?: string) {
        this.visualizer.pushState(`speaker-${id}`, () => {
            this.showUser(id, owners, scrollTo);
        });
        // Build the panel
        const panel = $('<div class="panel"></div>');
        // Add the title
        panel.append($(`<h3>User ${this.visualizer.dataset.uidToNicknames?.get(id) ?? id}</h3>`));
        panel.append($("<hr/>"));
        const codes = this.getGraph<Code>().nodes;
        // Show the items
        const list = $('<ol class="quote"></ol>').appendTo(panel);
        const items = filterItemByUser(this.visualizer.dataset.source, [id]);
        let targetElement: Cash | undefined;
        items.forEach((item) => {
            // TODO: Support subchunks
            if ("items" in item) {
                return;
            }
            // Show the item
            const current = renderItem(this.visualizer, item, owners).appendTo(list);
            if (item.id === scrollTo) {
                targetElement = current;
                current.addClass("highlighted");
            }
            // Show related codes
            current.append(renderExamples(codes, this.visualizer, item, owners));
        });
        // Show the dialog
        this.#showPanel(panel);
        // Scroll to the target element
        if (targetElement) {
            const offset = targetElement.offset()?.top ?? NaN;
            this.container
                .children("div.content")
                .get(0)
                ?.scrollTo(0, offset - 60);
        }
    }

    /** Show a dialog for a chunk. */
    showChunk(name: string, chunk: DataChunk<DataItem>, owners: number[] = [], scrollTo?: string) {
        this.visualizer.pushState(`chunk-${name}`, () => {
            this.showChunk(name, chunk, owners, scrollTo);
        });
        // Build the panel
        const panel = $('<div class="panel"></div>');
        // Add the title
        panel.append($(`<h3>Chunk ${name} (${chunk.items.length} Items)</h3>`));
        panel.append($("<hr/>"));
        const codes = this.getGraph<Code>().nodes;
        // Show the items
        const list = $('<ol class="quote"></ol>').appendTo(panel);
        const items = chunk.items;
        // TODO: Support subchunks
        if (!("chunk" in items[0])) {
            return;
        }
        let orthodox = items[0].chunk === name;
        if (orthodox) {
            $('<li class="split">Items inside the chunk:</li>').prependTo(list);
        }
        let targetElement: Cash | undefined;
        items.forEach((item) => {
            // TODO: Support subchunks
            if (!("chunk" in item)) {
                return;
            }
            // Show divisors when needed
            if ((item.chunk === name) !== orthodox) {
                $("<hr>").appendTo(list);
                if (!orthodox) {
                    $('<li class="split">Items before the chunk:</li>').prependTo(list);
                    $('<li class="split">Items inside the chunk:</li>').appendTo(list);
                } else {
                    $('<li class="split">Items after the chunk:</li>').appendTo(list);
                }
                orthodox = !orthodox;
            }
            // Show the item
            const current = renderItem(this.visualizer, item, owners).appendTo(list);
            if (item.id === scrollTo) {
                targetElement = current;
                current.addClass("highlighted");
            }
            // Show related codes
            current.append(renderExamples(codes, this.visualizer, item, owners));
        });
        // Show the dialog
        this.#showPanel(panel);
        // Scroll to the target element
        if (targetElement) {
            const offset = targetElement.offset()?.top ?? NaN;
            this.container
                .children("div.content")
                .get(0)
                ?.scrollTo(0, offset - 60);
        }
    }
    /** Show a dialog for a chunk based on the content ID. */
    showChunkOf(id: string) {
        const chunks = getChunks(this.dataset.source.data);
        const chunk = chunks.find((chunk) =>
            chunk.items.find((item) => {
                // TODO: Support subchunks
                if (!("chunk" in item)) {
                    return;
                }
                return item.id === id && (!item.chunk || item.chunk === chunk.id);
            }),
        );
        if (chunk) {
            this.showChunk(chunk.id, chunk, undefined, id);
        }
    }

    /** Compare the coverage by clusters. */
    compareCoverageByClusters() {
        this.visualizer.pushState("compare-coverage-by-clusters", () => {
            this.compareCoverageByClusters();
        });
        // Build the panel
        const panel = $('<div class="panel"></div>');
        // Add the title
        const title = $("<h3>Potential Bias of Codebooks (By Clusters)</h3>").appendTo(panel);
        panel.append($("<hr/>"));
        // Evaluate the coverage
        const graph = this.getGraph<Code>();
        const results = evaluatePerCluster(this.dataset, graph, this.parameters);
        const colors = d3.scaleSequential().interpolator(d3.interpolateRdYlGn).domain([-1, 1]);
        // Build the table
        this.buildTable(
            results,
            (row, { component, coverages, differences }, idx) => {
                row.append(
                    $(
                        `<td class="actionable"><h4>${idx + 1}. ${component.representative?.data.label}</h4><p class="tips">${
                            component.nodes.length
                        } codes</p></td>`,
                    ).on("click", () => {
                        (this.sidePanel.showPanel("Codes") as CodeSection).showComponent(component);
                    }),
                );
                coverages.forEach((coverage, i) => {
                    const difference = differences[i];
                    const color = colors(Math.min(1, difference));
                    const cell = $('<td class="metric-cell actionable"></td>')
                        .text(d3.format("+.1%")(difference))
                        .css("background", color)
                        .css("color", d3.lab(color).l > 70 ? "black" : "white")
                        .on("click", () => {
                            this.visualizer.setFilter(false, new OwnerFilter(), i + 1, false);
                            (this.sidePanel.showPanel("Codes") as CodeSection).showComponent(
                                component,
                            );
                        })
                        .append($("<p></p>").text(d3.format(".1%")(coverage)));
                    row.append(cell);
                });
            },
            ["Cluster", ...this.dataset.names.slice(1)],
        ).appendTo(panel);
        // Copy to clipboard
        title.append(
            $('<span><a href="javascript:void(0)" class="copy">Copy to Clipboard</a></span>').on(
                "click",
                () => {
                    const table = [
                        `ID\tCluster (Representative Code)\tCodes\t${this.dataset.names.slice(1).join("\t")}`,
                    ];
                    results.forEach(({ component, differences }, idx) => {
                        table.push(
                            `${idx + 1}.\t${component.representative?.data.label}\t${component.nodes.length}\t${differences
                                .map((difference) => d3.format(".1%")(difference).replace("−", "-"))
                                .join("\t")}`,
                        );
                    });
                    void navigator.clipboard.writeText(table.join("\n"));
                },
            ),
        );
        // Show the dialog
        this.#showPanel(panel);
    }

    /** Human-verified ownership information. */
    #verifiedOwnerships = new Map<string, Map<number, number>>();
    /** Validate the coverage by individual codes. */
    validateCoverageByCodes(scrollTo?: string) {
        this.visualizer.pushState("validate-coverage-by-codes", () => {
            this.validateCoverageByCodes(scrollTo);
        });
        // Build the panel
        const panel = $('<div class="panel"></div>');
        let targetElement: Cash | undefined;
        // Add the title
        const title = $("<h3>Ownership of Codes</h3>").appendTo(panel);
        panel.append($("<hr/>"));
        // Get the codebooks
        const indexes =
            this.visualizer.getFilter<unknown, number>("Owner")?.parameters ??
            this.visualizer.dataset.weights
                ?.map((weight, idx) => (weight > 0 ? idx : -1))
                .filter((idx) => idx >= 0) ??
            [];
        const names = indexes.map((idx) => this.dataset.names[idx]);
        // Get the codes
        const graph = this.getGraph<Code>();
        const distances = this.visualizer.dataset.distances;
        const codes = [...graph.nodes];
        seededShuffle(codes, 131072);
        codes.forEach((node) => {
            if (!this.#verifiedOwnerships.has(node.id)) {
                const dft = new Map<number, number>();
                for (let idx = 0; idx < this.visualizer.dataset.codebooks.length; idx++) {
                    dft.set(idx, node.owners.has(idx) ? 2 : node.nearOwners.has(idx) ? 1 : 0);
                }
                this.#verifiedOwnerships.set(node.id, dft);
            }
        });
        // Build the table
        this.buildTable(
            codes,
            (row, node, idx) => {
                if (node.data.label === scrollTo) {
                    targetElement = row;
                }
                // Show the label
                row.append(
                    $(`<td class="actionable"><h4>${idx + 1}. ${node.data.label}</h4></td>`).on(
                        "click",
                        () => {
                            this.visualizer.pushState("validate-coverage-by-codes", () => {
                                this.validateCoverageByCodes(node.data.label);
                            });
                            this.showCode(0, node.data);
                        },
                    ),
                );
                // Show the description
                const description = $(
                    '<tr class="description"><td></td><td colspan="100"><p></p></td></tr>',
                );
                description.find("p").text(`${node.data.definitions?.join(", ")}`);
                row.after(description);
                // Show the ownerships
                for (const codebook of indexes) {
                    ((idx) => {
                        const codebook = this.dataset.codebooks[idx];
                        const cell = $('<td class="codes"></td>').appendTo(row);
                        // Select
                        const select = $(`<select>
                            <option value="0">Not related</option>
                            <option value="1">Related</option>
                            <option value="2">Very related</option>
                        </select>`).appendTo(cell);
                        select
                            .on("change", () => {
                                this.#verifiedOwnerships
                                    .get(node.id)
                                    ?.set(idx, parseInt(select.val() as string));
                            })
                            .val(this.#verifiedOwnerships.get(node.id)?.get(idx)?.toString() ?? "");
                        // Find the related codes
                        let related: Code[] = [];
                        if (node.owners.has(idx)) {
                            related = [node.data];
                        } else {
                            // Find the closest owned code
                            const owned = codes.filter((code) => code.owners.has(idx));
                            // Same logic as the links: if there are "similar" codes, use them all; otherwise, show the closest one
                            let nearest = owned.filter(
                                (code) => distances[node.index][code.index] <= graph.minDist,
                            );
                            if (nearest.length === 0) {
                                nearest = owned
                                    .filter(
                                        (code) =>
                                            distances[node.index][code.index] <= graph.maxDist,
                                    )
                                    .sort(
                                        (a, b) =>
                                            distances[a.index][node.index] -
                                            distances[b.index][node.index],
                                    );
                                if (nearest.length > 1) {
                                    nearest = [nearest[0]];
                                }
                            }
                            related = nearest.map((code) => code.data);
                        }
                        // Show the related codes
                        for (const original of related) {
                            for (const code of findOriginalCodes(codebook, original, idx)) {
                                ((original, code) => {
                                    const link = $('<a href="javascript:void(0)"></a>')
                                        .text(code.label)
                                        .appendTo(cell);
                                    link.on("click", () => {
                                        this.visualizer.pushState(
                                            "validate-coverage-by-codes",
                                            () => {
                                                this.validateCoverageByCodes(node.data.label);
                                            },
                                        );
                                        this.showCode(idx, original, code);
                                    });
                                })(original, code);
                            }
                        }
                    })(codebook);
                }
            },
            ["Label", ...names],
        )
            .addClass("code-table")
            .appendTo(panel);
        // Copy to clipboard
        title.append(
            $('<span><a href="javascript:void(0)" class="copy">Save to Clipboard</a></span>').on(
                "click",
                () => {
                    const table = [`Label\t${names.join("\t")}`];
                    codes.forEach((Node) => {
                        const owners =
                            this.#verifiedOwnerships.get(Node.id) ?? new Map<number, number>();
                        table.push(
                            `${Node.data.label}\t${indexes.map((Index) => owners.get(Index)).join("\t")}`,
                        );
                    });
                    void navigator.clipboard.writeText(table.join("\n"));
                },
            ),
        );
        // Load from clipboard
        title.append(
            $('<span><a href="javascript:void(0)" class="copy">Load from Clipboard</a></span>').on(
                "click",
                () => {
                    if (!confirm("Are you sure you want to load ownerships from the clipboard?")) {
                        return;
                    }
                    void navigator.clipboard.readText().then((text) => {
                        const table = text.split("\n").map((line) => {
                            if (line.endsWith("\r")) {
                                line = line.slice(0, -1);
                            }
                            return line.split("\t");
                        });
                        const header = table[0];
                        const indexes = header
                            .slice(1)
                            .map((name) => this.dataset.names.indexOf(name));
                        table.slice(1).forEach(([label, ...owners]) => {
                            const node = codes.find((node) => node.data.label === label);
                            if (!node) {
                                return;
                            }
                            owners.forEach((owner, idx) =>
                                this.#verifiedOwnerships
                                    .get(node.id)
                                    ?.set(indexes[idx], parseInt(owner)),
                            );
                        });
                        this.validateCoverageByCodes();
                    });
                },
            ),
        );
        // Clear the values
        title.append(
            $('<span><a href="javascript:void(0)" class="copy">Clear All</a></span>').on(
                "click",
                () => {
                    if (!confirm("Are you sure you want to clear all ownerships?")) {
                        return;
                    }
                    this.#verifiedOwnerships.forEach((owners) => {
                        indexes.forEach((idx) => owners.set(idx, 0));
                    });
                    this.validateCoverageByCodes();
                },
            ),
        );
        // Show the dialog
        this.#showPanel(panel);
        // Scroll to the target element
        if (targetElement) {
            const offset = targetElement.offset()?.top ?? NaN;
            this.container
                .children("div.content")
                .get(0)
                ?.scrollTo(0, offset - 60);
        }
    }
}
