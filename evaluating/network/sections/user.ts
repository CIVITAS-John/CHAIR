import type { Cash } from "cash-dom";
import d3 from "d3";

import { Panel } from "../panels/panel.js";
import { evaluateUsers } from "../utils/evaluate.js";
import { UserFilter } from "../utils/filters.js";
import type { Visualizer } from "../visualizer.js";

/** The speaker side panel. */
export class UserSection extends Panel {
    /** The short name of the panel. */
    override name = "Speakers";
    /** The title of the panel. */
    override title = "Speaker Overview";

    /** Constructing the panel. */
    constructor(container: Cash, visualizer: Visualizer) {
        super(container, visualizer);
        this.visualizer = visualizer;
        this.container = $('<div class="user"></div>').appendTo(container).hide();
    }

    /** Render the panel. */
    override render() {
        this.container.empty();
        // Some notes
        this.container.append(
            $('<p class="tips"></p>').text(
                "Note that all metrics are relative (i.e. against the Aggregated Code Space of the following Code Spaces).",
            ),
        );
        // Evaluate the codebooks
        const users = Array.from(this.dataset.uidToNicknames?.keys() ?? []);
        const results = evaluateUsers(this.visualizer.dataset, this.parameters);
        const metrics = Object.keys(results[users[0]]).slice(0, -1);
        const colors: Record<string, d3.ScaleSequential<string>> = {};
        // Flatten the dataset
        const dataset: { id: string; name: string; metric: string; value: number }[] = [];
        for (const user of users) {
            const result = results[user];
            for (const metric of metrics) {
                dataset.push({
                    id: user,
                    name: this.dataset.uidToNicknames?.get(user) ?? "",
                    metric,
                    value: result[metric],
                });
            }
        }
        // Build color scales
        for (const metric of metrics) {
            const minimum =
                d3.min(
                    dataset.filter((Evaluation) => Evaluation.metric === metric),
                    (Evaluation) => Evaluation.value,
                ) ?? NaN;
            const maximum =
                d3.max(
                    dataset.filter((Evaluation) => Evaluation.metric === metric),
                    (Evaluation) => Evaluation.value,
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
                // Name of the codebook
                const summary = $('<td class="codebook-cell"></td>')
                    .attr("id", `user-${idx + 1}`)
                    .addClass("actionable")
                    .appendTo(row);
                summary
                    .append($("<h4></h4>").text(this.dataset.uidToNicknames?.get(key) ?? key))
                    .append($('<p class="tips"></p>').text(`${results[key].count} items`))
                    .on("mouseover", () => this.visualizer.setFilter(true, new UserFilter(), key))
                    .on("mouseout", () => this.visualizer.setFilter(true, new UserFilter()))
                    .on("click", (event: MouseEvent) => {
                        if (event.shiftKey) {
                            this.visualizer.setFilter(false, new UserFilter(), key, true);
                        } else {
                            if (!this.visualizer.isFilterApplied("User", key)) {
                                this.visualizer.setFilter(
                                    false,
                                    new UserFilter(),
                                    key,
                                    event.shiftKey,
                                    "Coverage",
                                );
                            }
                            this.visualizer.dialog.showUser(key);
                        }
                    })
                    .toggleClass("chosen", this.visualizer.isFilterApplied("User", key));
                // Evaluation results
                metrics.forEach((metric) => {
                    const metricValue = value[metric];
                    const color = colors[metric](metricValue);
                    const cell = $('<td class="metric-cell"></td>')
                        .attr("id", `metric-${idx}-${metric}`)
                        .text(d3.format(metric === "divergence" ? ".1%" : ".1%")(metricValue))
                        .on("mouseover", () =>
                            this.visualizer.setFilter(true, new UserFilter(), key, false, metric),
                        )
                        .on("mouseout", () => this.visualizer.setFilter(true, new UserFilter()))
                        .on("click", (event: MouseEvent) =>
                            this.visualizer.setFilter(
                                false,
                                new UserFilter(),
                                key,
                                event.shiftKey,
                                metric,
                            ),
                        )
                        .css("background", color)
                        .css("color", d3.lab(color).l > 70 ? "black" : "white")
                        .toggleClass(
                            "chosen",
                            this.visualizer.isFilterApplied("User", key, metric),
                        );
                    row.append(cell);
                });
            },
            ["Speaker", ...metrics],
        );
    }
}
