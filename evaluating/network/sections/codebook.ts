import d3 from "d3";
import { Cash } from "cash-dom";
import { Panel } from "../panels/panel.js";
import { Visualizer } from "../visualizer.js";
import { Evaluate } from "../utils/evaluate.js";
import { GetConsolidatedSize } from "../utils/dataset.js";
import { OwnerFilter } from "../utils/filters.js";

/** CodebookSection: The codebook side panel. */
export class CodebookSection extends Panel {
    /** Name: The short name of the panel. */
    public Name: string = "Codebooks";
    /** Title: The title of the panel. */
    public override Title: string = "Codebook Overview";
    /** Constructor: Constructing the panel. */
    public constructor(Container: Cash, Visualizer: Visualizer) {
        super(Container, Visualizer);
        this.Visualizer = Visualizer;
        this.Container = $(`<div class="codebook"></div>`).appendTo(Container).hide();
    }
    /** Render: Render the panel. */
    public override Render() {
        this.Container.empty();
        // Some notes
        this.Container.append(
            $(`<p class="tips"></p>`).text(
                "Note that all metrics are relative (i.e. against the Aggregated Code Space of the following Code Spaces).",
            ),
        );
        // Evaluate the codebooks
        var Names = this.Dataset.Names;
        var Codebooks = this.Dataset.Codebooks;
        var Results = Evaluate(this.Visualizer.Dataset, this.Parameters);
        var Metrics = Object.keys(Results[Names[1]]).slice(0, -2);
        var Colors: Record<string, d3.ScaleSequential<string, never>> = {};
        // Flatten the dataset
        var Dataset: { Name: string; Metric: string; Value: number }[] = [];
        for (var I = 1; I < Names.length; I++) {
            var Result = Results[Names[I]];
            for (var J = 0; J < Metrics.length; J++) {
                Dataset.push({ Name: Names[I], Metric: Metrics[J], Value: Result[Metrics[J]] });
            }
        }
        // Build color scales
        for (var Metric of Metrics) {
            var Minimum = d3.min(
                Dataset.filter((Evaluation) => Evaluation.Metric == Metric),
                (Evaluation) => Evaluation.Value,
            )!;
            var Maximum = d3.max(
                Dataset.filter((Evaluation) => Evaluation.Metric == Metric),
                (Evaluation) => Evaluation.Value,
            )!;
            if (Metric == "Divergence") {
                Colors[Metric] = d3.scaleSequential().interpolator(d3.interpolateViridis).domain([Maximum, Minimum]);
            } else {
                Colors[Metric] = d3.scaleSequential().interpolator(d3.interpolateViridis).domain([Minimum, Maximum]);
            }
        }
        // Render the codebooks and evaluation results
        this.BuildTable(
            Object.entries(Results),
            (Row, [Key, Value], Index) => {
                var Codebook = Codebooks[Index + 1];
                // Name of the codebook
                var Summary = $(`<td class="codebook-cell"></td>`)
                    .attr("id", `codebook-${Index + 1}`)
                    .addClass("actionable")
                    .appendTo(Row);
                Summary.append($(`<h4></h4>`).text(Key))
                    .append($(`<p class="tips"></p>`).text(`${Object.keys(Codebook).length} codes`))
                    .append($(`<p class="tips"></p>`).text(`${GetConsolidatedSize(Codebooks[0], Codebook)} consolidated`))
                    .on("mouseover", (Event) => this.Visualizer.SetFilter(true, new OwnerFilter(), Index + 1))
                    .on("mouseout", (Event) => this.Visualizer.SetFilter(true, new OwnerFilter()))
                    .on("click", (Event) => {
                        if (Event.shiftKey) {
                            this.Visualizer.SetFilter(false, new OwnerFilter(), Index + 1, true);
                        } else {
                            if (!this.Visualizer.IsFilterApplied("Owner", Index + 1))
                                this.Visualizer.SetFilter(false, new OwnerFilter(), Index + 1, Event.shiftKey, "Coverage");
                            this.Visualizer.SidePanel.ShowPanel("Codes");
                        }
                    })
                    .toggleClass("chosen", this.Visualizer.IsFilterApplied("Owner", Index + 1));
                // Evaluation results
                Metrics.forEach((Metric) => {
                    var MetricValue = Value[Metric];
                    var Color = Colors[Metric](MetricValue);
                    var Cell = $(`<td class="metric-cell"></td>`)
                        .attr("id", `metric-${Index}-${Metric}`)
                        .text(d3.format(Metric == "Divergence" ? ".1%" : ".1%")(MetricValue))
                        .on("mouseover", (Event) => this.Visualizer.SetFilter(true, new OwnerFilter(), Index + 1, false, Metric))
                        .on("mouseout", (Event) => this.Visualizer.SetFilter(true, new OwnerFilter()))
                        .on("click", (Event) => this.Visualizer.SetFilter(false, new OwnerFilter(), Index + 1, Event.shiftKey, Metric))
                        .css("background", Color)
                        .css("color", d3.lab(Color).l > 70 ? "black" : "white")
                        .toggleClass("chosen", this.Visualizer.IsFilterApplied("Owner", Index + 1, Metric));
                    Row.append(Cell);
                });
            },
            ["Codebook", ...Metrics],
        );
    }
}