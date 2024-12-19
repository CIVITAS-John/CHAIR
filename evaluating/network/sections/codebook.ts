import type { Cash } from "cash-dom";
import d3 from "d3";

import { Panel } from "../panels/panel.js";
import { GetConsolidatedSize } from "../utils/dataset.js";
import { EvaluateCodebooks } from "../utils/evaluate.js";
import { OwnerFilter } from "../utils/filters.js";
import type { Visualizer } from "../visualizer.js";

/** CodebookSection: The codebook side panel. */
export class CodebookSection extends Panel {
    /** Name: The short name of the panel. */
    public Name = "Coders";
    /** Title: The title of the panel. */
    public override Title = "Codebook Overview";
    /** Constructor: Constructing the panel. */
    public constructor(Container: Cash, Visualizer: Visualizer) {
        super(Container, Visualizer);
        this.Visualizer = Visualizer;
        this.Container = $('<div class="codebook"></div>').appendTo(Container).hide();
    }
    /** Render: Render the panel. */
    public override Render() {
        this.Container.empty();
        // Some notes
        $('<p class="tips"></p>')
            .appendTo(this.Container)
            .html(
                `Note that all metrics are relative (i.e. against the Aggregated Code Space of the following Code Spaces).
                <a href="javascript:void(0)">Click here</a> to manually verify each codebook's coverage.`,
            )
            .find("a")
            .on("click", () => {
                this.Visualizer.Dialog.ValidateCoverageByCodes();
            });
        // Evaluate the codebooks
        const Names = this.Dataset.Names;
        const Codebooks = this.Dataset.Codebooks;
        const Results = EvaluateCodebooks(this.Visualizer.Dataset, this.Parameters);
        const Metrics = Object.keys(Results[Names[1]]).slice(0, -2);
        const Colors: Record<string, d3.ScaleSequential<string>> = {};
        // Flatten the dataset
        const Dataset: { Name: string; Metric: string; Value: number }[] = [];
        for (const Name of Names) {
            const Result = Results[Name];
            for (const Metric of Metrics) {
                Dataset.push({ Name, Metric, Value: Result[Metric] });
            }
        }
        // Build color scales
        for (const Metric of Metrics) {
            const Minimum = d3.min(
                Dataset.filter((Evaluation) => Evaluation.Metric === Metric),
                (Evaluation) => Evaluation.Value,
            )!;
            const Maximum = d3.max(
                Dataset.filter((Evaluation) => Evaluation.Metric === Metric),
                (Evaluation) => Evaluation.Value,
            )!;
            if (Metric === "Divergence") {
                Colors[Metric] = d3
                    .scaleSequential()
                    .interpolator(d3.interpolateViridis)
                    .domain([Maximum, Minimum]);
            } else {
                Colors[Metric] = d3
                    .scaleSequential()
                    .interpolator(d3.interpolateViridis)
                    .domain([Minimum, Maximum]);
            }
        }
        // Render the codebooks and evaluation results
        this.BuildTable(
            Object.entries(Results),
            (Row, [Key, Value], Index) => {
                const Codebook = Codebooks[Index + 1];
                // Name of the codebook
                const Summary = $('<td class="codebook-cell"></td>')
                    .attr("id", `codebook-${Index + 1}`)
                    .addClass("actionable")
                    .appendTo(Row);
                Summary.append($("<h4></h4>").text(Key))
                    .append($('<p class="tips"></p>').text(`${Object.keys(Codebook).length} codes`))
                    .append(
                        $('<p class="tips"></p>').text(
                            `${GetConsolidatedSize(Codebooks[0], Codebook)} consolidated`,
                        ),
                    )
                    .on("mouseover", () =>
                        this.Visualizer.SetFilter(true, new OwnerFilter(), Index + 1),
                    )
                    .on("mouseout", () => this.Visualizer.SetFilter(true, new OwnerFilter()))
                    .on("click", (Event: MouseEvent) => {
                        if (Event.shiftKey) {
                            this.Visualizer.SetFilter(false, new OwnerFilter(), Index + 1, true);
                        } else {
                            if (!this.Visualizer.IsFilterApplied("Owner", Index + 1)) {
                                this.Visualizer.SetFilter(
                                    false,
                                    new OwnerFilter(),
                                    Index + 1,
                                    Event.shiftKey,
                                    "Coverage",
                                );
                            }
                            this.Visualizer.SidePanel.ShowPanel("Codes");
                        }
                    })
                    .toggleClass("chosen", this.Visualizer.IsFilterApplied("Owner", Index + 1));
                // Evaluation results
                Metrics.forEach((Metric) => {
                    const MetricValue = Value[Metric];
                    const Color = Colors[Metric](MetricValue);
                    const Cell = $('<td class="metric-cell"></td>')
                        .attr("id", `metric-${Index}-${Metric}`)
                        .text(d3.format(Metric === "Divergence" ? ".1%" : ".1%")(MetricValue))
                        .on("mouseover", () =>
                            this.Visualizer.SetFilter(
                                true,
                                new OwnerFilter(),
                                Index + 1,
                                false,
                                Metric,
                            ),
                        )
                        .on("mouseout", () => this.Visualizer.SetFilter(true, new OwnerFilter()))
                        .on("click", (Event: MouseEvent) =>
                            this.Visualizer.SetFilter(
                                false,
                                new OwnerFilter(),
                                Index + 1,
                                Event.shiftKey,
                                Metric,
                            ),
                        )
                        .css("background", Color)
                        .css("color", d3.lab(Color).l > 70 ? "black" : "white")
                        .toggleClass(
                            "chosen",
                            this.Visualizer.IsFilterApplied("Owner", Index + 1, Metric),
                        );
                    Row.append(Cell);
                });
            },
            ["Codebook", ...Metrics],
        );
    }
}
