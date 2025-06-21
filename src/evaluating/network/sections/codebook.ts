import type { Cash } from "cash-dom";
import d3 from "d3";

import { Panel } from "../panels/panel.js";
import { getConsolidatedSize } from "../utils/dataset.js";
import { evaluateCodebooks } from "../utils/evaluate.js";
import { OwnerFilter } from "../utils/filters.js";
import type { Visualizer } from "../visualizer.js";

/** The codebook side panel. */
export class CodebookSection extends Panel {
    /** The short name of the panel. */
    override name = "Coders";
    /** The title of the panel. */
    override title = "Codebook Overview";

    /** Constructing the panel. */
    constructor(container: Cash, visualizer: Visualizer) {
        super(container, visualizer);
        this.visualizer = visualizer;
        this.container = $('<div class="codebook"></div>').appendTo(container).hide();
    }

    /** Render the panel. */
    override render() {
        this.container.empty();
        // Some notes
        $('<p class="tips"></p>')
            .appendTo(this.container)
            .html(
                `Note that all metrics are relative (i.e. against the Aggregated Code Space of the following Code Spaces).
                <a href="javascript:void(0)">Click here</a> to manually verify each codebook's coverage.`,
            )
            .find("a")
            .on("click", () => {
                this.visualizer.dialog.validateCoverageByCodes();
            });
        // Evaluate the codebooks
        const names = this.dataset.names;
        const codebooks = this.dataset.codebooks;
        const results = evaluateCodebooks(this.visualizer.dataset, this.parameters);
        const metrics = Object.keys(results[names[1]]).slice(0, -2);
        const colors: Record<string, d3.ScaleSequential<string>> = {};
        // Flatten the dataset
        const dataset: { name: string; metric: string; value: number }[] = [];
        for (const name of names) {
            const result = results[name];
            if (name == "$$$ total" || typeof result !== "object") continue;
            for (const metric of metrics) {
                dataset.push({ name, metric, value: result[metric] });
            }
        }
        // Build color scales
        for (const metric of metrics) {
            const minimum =
                d3.min(
                    dataset.filter((evaluation) => evaluation.metric === metric),
                    (evaluation) => evaluation.value,
                ) ?? NaN;
            const maximum =
                d3.max(
                    dataset.filter((evaluation) => evaluation.metric === metric),
                    (evaluation) => evaluation.value,
                ) ?? NaN;
            if (metric === "divergence") {
                colors[metric] = d3
                    .scaleSequential()
                    .interpolator(d3.interpolateViridis)
                    .domain([maximum, minimum]);
            } else {
                colors[metric] = d3
                    .scaleSequential()
                    .interpolator(d3.interpolateViridis)
                    .domain([minimum, maximum]);
            }
        }
        // Render the codebooks and evaluation results
        this.buildTable(
            Object.entries(results),
            (row, [key, value], idx) => {
                const codebook = codebooks[idx + 1];
                // Name of the codebook
                const summary = $('<td class="codebook-cell"></td>')
                    .attr("id", `codebook-${idx + 1}`)
                    .addClass("actionable")
                    .appendTo(row);
                summary
                    .append($("<h4></h4>").text(key))
                    .append($('<p class="tips"></p>').text(`${Object.keys(codebook).length} codes`))
                    .append(
                        $('<p class="tips"></p>').text(
                            `${getConsolidatedSize(codebooks[0], codebook)} consolidated`,
                        ),
                    )
                    .on("mouseover", () =>
                        this.visualizer.setFilter(true, new OwnerFilter(), idx + 1),
                    )
                    .on("mouseout", () => this.visualizer.setFilter(true, new OwnerFilter()))
                    .on("click", (event: MouseEvent) => {
                        if (event.shiftKey) {
                            this.visualizer.setFilter(false, new OwnerFilter(), idx + 1, true);
                        } else {
                            if (!this.visualizer.isFilterApplied("Owner", idx + 1)) {
                                this.visualizer.setFilter(
                                    false,
                                    new OwnerFilter(),
                                    idx + 1,
                                    event.shiftKey,
                                    "Coverage",
                                );
                            }
                            this.visualizer.sidePanel.showPanel("Codes");
                        }
                    })
                    .toggleClass("chosen", this.visualizer.isFilterApplied("Owner", idx + 1));
                // Evaluation results
                metrics.forEach((metric) => {
                    const metricValue = value[metric];
                    const color = colors[metric](metricValue);
                    const cell = $('<td class="metric-cell"></td>')
                        .attr("id", `metric-${idx}-${metric}`)
                        .text(d3.format(metric === "divergence" ? ".1%" : ".1%")(metricValue))
                        .on("mouseover", () =>
                            this.visualizer.setFilter(
                                true,
                                new OwnerFilter(),
                                idx + 1,
                                false,
                                metric,
                            ),
                        )
                        .on("mouseout", () => this.visualizer.setFilter(true, new OwnerFilter()))
                        .on("click", (event: MouseEvent) =>
                            this.visualizer.setFilter(
                                false,
                                new OwnerFilter(),
                                idx + 1,
                                event.shiftKey,
                                metric,
                            ),
                        )
                        .css("background", color)
                        .css("color", d3.lab(color).l > 70 ? "black" : "white")
                        .toggleClass(
                            "chosen",
                            this.visualizer.isFilterApplied("Owner", idx + 1, metric),
                        );
                    row.append(cell);
                });
            },
            ["Codebook", ...metrics],
        );
    }
}
