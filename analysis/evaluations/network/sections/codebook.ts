import d3 from 'd3';
import { Cash } from 'cash-dom';
import { Panel } from '../panels/panel.js';
import { Visualizer } from '../visualizer.js';
import { Evaluate } from '../utils/evaluate.js';
import { FindConsolidatedCode } from '../utils/dataset.js';
import { OwnerFilter } from '../utils/filters.js';

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
        this.Container.append($(`<p class="tips"></p>`).text("Note that all metrics are relative (i.e. against the consolidated conceptual space of the following codebooks)."))
        // Evaluate the codebooks
        var Names = this.Dataset.Names;
        var Codebooks = this.Dataset.Codebooks;
        var Results = Evaluate(this.Visualizer.Dataset, this.Visualizer.Parameters);
        var Metrics = Object.keys(Results[Names[1]]);
        var Colors: Record<string, d3.ScaleSequential<string, never>> = {};
        // Flatten the dataset
        var Dataset: { Name: string, Metric: string, Value: number }[] = [];
        for (var I = 1; I < Names.length; I++) {
            var Result = Results[Names[I]];
            for (var J = 0; J < Metrics.length; J++) {
                Dataset.push({ Name: Names[I], Metric: Metrics[J], Value: Result[Metrics[J]] });
            }
        }
        // Build color scales
        for (var Metric of Metrics) {
            var Minimum = d3.min(Dataset.filter(Evaluation => Evaluation.Metric == Metric), (Evaluation) => Evaluation.Value)!;
            var Maximum = d3.max(Dataset.filter(Evaluation => Evaluation.Metric == Metric), (Evaluation) => Evaluation.Value)!;
            Colors[Metric] = d3.scaleSequential()
                .interpolator(d3.interpolateViridis)
                .domain([Minimum, Maximum]);
        }
        // Render the codebooks and evaluation results
        this.BuildTable(
            Object.entries(Results), (Row, [Key, Value], Index) => {
                var Codebook = Codebooks[Index + 1];
                // Name of the codebook
                var Summary = $(`<td class="codebook-cell"></td>`).attr("id", `codebook-${Index + 1}`).addClass("actionable").appendTo(Row);
                Summary.append($(`<h4></h4>`).text(Key))
                       .append($(`<p></p>`).text(`${Object.keys(Codebook).length} codes`))
                       .append($(`<p></p>`).text(`${new Set(Object.keys(Codebook).map(Code => FindConsolidatedCode(Codebooks[0], Code)!.Label)).size} consolidated`))
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
                Metrics.forEach(Metric => {
                    var MetricValue = Value[Metric];
                    var Color = Colors[Metric](MetricValue);
                    var Cell = $(`<td class="metric-cell"></td>`)
                        .attr("id", `metric-${Index}-${Metric}`)
                        .text(d3.format(".1%")(MetricValue))
                        .on("mouseover", (Event) => this.Visualizer.SetFilter(true, new OwnerFilter(), Index + 1, false, Metric))
                        .on("mouseout", (Event) => this.Visualizer.SetFilter(true, new OwnerFilter()))
                        .on("click", (Event) => this.Visualizer.SetFilter(false, new OwnerFilter(), Index + 1, Event.shiftKey, Metric))
                        .css("background", Color)
                        .css("color", d3.lab(Color).l > 70 ? "black" : "white")
                        .toggleClass("chosen", this.Visualizer.IsFilterApplied("Owner", Index + 1, Metric));
                    Row.append(Cell);
                });
            }, ["Codebook", ...Metrics]
        )
    }
}

/* 
        // Render the results as a D3.js heatmap
        var Names = this.Visualizer.Dataset.Names;
        var LongestName = d3.max(Names, (Name) => Name.length)!;
        var Margin = { Top: 25, Right: 0, Bottom: 0, Left: Math.max(LongestName * 3.5, 20) };
        var Width = this.Container.innerWidth()! - Margin.Left - Margin.Right;
        var Height = this.Container.innerHeight()! - Margin.Top - Margin.Bottom;
        var SVG = d3.select(this.Container[0]!)
            .append("svg")
                .attr("width", this.Container.width())
                .attr("height", this.Container.height())
            .append("g")
                .attr("transform", `translate(${Margin.Left},${Margin.Top})`);
        // Build X scale (Metrics)
        var Metrics = Object.keys(Results[Names[1]]);
        var X = d3.scaleBand()
            .domain(Metrics)
            .range([0, Width])
            .padding(0.05);
        var XAxis = SVG.append("g").call(d3.axisTop(X).tickSize(0))
        XAxis.selectAll("text")
            .attr("font-size", "1em")
            .attr("style", "font-weight: bold");
        XAxis.select(".domain").remove();
        // Build Y scale (Codebooks)
        var Y = d3.scaleBand()
            .domain(Names.slice(1))
            .range([0, Height])
            .padding(0.05);
        var YAxis = SVG.append("g").call(d3.axisLeft(Y).tickSize(0));
        YAxis.selectAll("text")
            .attr("font-size", "1em")
            .attr("transform", `rotate(-45) translate(${Margin.Left / 2} -${Margin.Left / 2})`)
            .attr("style", "cursor: pointer")
            .on("mouseover", (Event, Owner) => this.Visualizer.FilterByOwner(false, Names.indexOf(Owner as string)))
            .on("mouseout", (Event, Owner) => this.Visualizer.SetFilter(false))
            .on("click", (Event, Owner) => this.Visualizer.FilterByOwner(true, Names.indexOf(Owner as string)));
        YAxis.select(".domain").remove()
        // Flatten the dataset
        var Dataset: { Name: string, Metric: string, Value: number }[] = [];
        for (var I = 1; I < Names.length; I++) {
            var Result = Results[Names[I]];
            for (var J = 0; J < Metrics.length; J++) {
                Dataset.push({ Name: Names[I], Metric: Metrics[J], Value: Result[Metrics[J]] });
            }
        }
        // Build color scales
        var Colors: Record<string, d3.ScaleSequential<string, never>> = {};
        for (var Metric of Metrics) {
            var Minimum = d3.min(Dataset.filter(Evaluation => Evaluation.Metric == Metric), (Evaluation) => Evaluation.Value)!;
            var Maximum = d3.max(Dataset.filter(Evaluation => Evaluation.Metric == Metric), (Evaluation) => Evaluation.Value)!;
            Colors[Metric] = d3.scaleSequential()
                .interpolator(d3.interpolateViridis)
                .domain([Minimum, Maximum]);
        }
        // Draw the heatmap
        SVG.selectAll()
            .data(Dataset, (Evaluation) => Evaluation!.Name + ":" + Evaluation!.Metric)
            .enter()
            .append("rect")
                .attr("x", (Evaluation) => X(Evaluation.Metric)!)
                .attr("y", (Evaluation) => Y(Evaluation.Name)!)
                .attr("rx", 4)
                .attr("ry", 4)
                .attr("width", X.bandwidth())
                .attr("height", Y.bandwidth())
                .style("cursor", "pointer")
                .style("fill", (Evaluation) => Colors[Evaluation.Metric](Evaluation.Value))
                .on("mouseover", (Event, Evaluation) => this.Visualizer.FilterByOwner(false, Names.indexOf(Evaluation.Name), Evaluation.Metric))
                .on("mouseout", (Event, Evaluation) => this.Visualizer.SetFilter(false))
                .on("click", (Event, Evaluation) => {
                    this.Visualizer.FilterByOwner(true, Names.indexOf(Evaluation.Name), Evaluation.Metric);
                    // d3.select(Event.currentTarget).attr("class", Status ? "selected" : "");
                });
        // Add the text labels
        SVG.selectAll()
            .data(Dataset, (Evaluation) => Evaluation!.Name + ":" + Evaluation!.Metric)
            .enter()
            .append("text")
                .attr("x", (Evaluation) => X(Evaluation.Metric)! + X.bandwidth() / 2)
                .attr("y", (Evaluation) => Y(Evaluation.Name)! + Y.bandwidth() / 2)
                .style("text-anchor", "middle")
                .style("font-size", "0.9em")
                .style("pointer-events", "none")
                .style("fill", (Evaluation) => d3.lab(Colors[Evaluation.Metric](Evaluation.Value)).l > 70 ? "black" : "white")
                .text((Evaluation) => d3.format(".1%")(Evaluation.Value)); */