import * as d3 from 'd3';
import type { Cash } from 'cash-dom';
import { Visualizer } from './visualizer.js';
import { CodebookEvaluation } from '../../../utils/schema.js';
import { BuildSemanticGraph } from './graph.js';

/** SidePanel: The side panel for the visualizer. */
export class SidePanel {
    /** Visualizer: The visualizer in-use. */
    private Visualizer: Visualizer;
    /** Container: The container for the side panel. */
    private Container: Cash;
    /** Contents: The content container for the side panel. */
    private Contents: Cash;
    /** Header: The header of the side panel. */
    private Header: Cash;
    /** Subpanels: The subpanels in the side panel. */
    private Subpanels: Record<string, PanelBase> = {};
    /** Constructor: Constructing the side panel. */
    public constructor(Container: Cash, Visualizer: Visualizer) {
        this.Visualizer = Visualizer;
        this.Container = Container;
        this.Container.find(".collapsable").on("click", () => {
            this.Container.toggleClass("collapsed");
            if (!this.Container.hasClass("collapsed")) this.ShowPanel("evaluator");
        });
        this.Header = this.Container.children(".panel-header");
        this.Contents = this.Container.children(".content");
        this.Subpanels["evaluator"] = new Evaluator(this.Contents, this.Visualizer);
    }
    /** ShowPanel: Show a side panel. */
    public ShowPanel(Name: string) {
        var Panel = this.Subpanels[Name];
        this.Header.children("h2").text(Panel.Title);
        for (var Key in this.Subpanels) {
            if (Key == Name) this.Subpanels[Key].Show();
            else this.Subpanels[Key].Hide();
        }
    }
}

/** PanelBase: The base class for side panels. */
export abstract class PanelBase {
    /** Title: The title of the panel. */
    public abstract Title: string;
    /** Visualizer: The visualizer in-use. */
    protected Visualizer: Visualizer;
    /** Container: The container for the panel. */
    protected Container: Cash;
    /** Constructor: Constructing the panel. */
    public constructor(Container: Cash, Visualizer: Visualizer) {
        this.Visualizer = Visualizer;
        this.Container = Container;
    }
    /** Show: Show the panel. */
    public Show() {
        this.Container.show();
        this.Render();
    }
    /** Hide: Hide the panel. */
    public Hide() {
        this.Container.hide();
    }
    /** Render: Render the panel. */
    public Render() { }
}

/** Evaluator: The evaluator side panel. */
export class Evaluator extends PanelBase {
    /** Title: The title of the panel. */
    public override Title: string = "Evaluator";
    /** Constructor: Constructing the panel. */
    public constructor(Container: Cash, Visualizer: Visualizer) {
        super(Container, Visualizer);
        this.Visualizer = Visualizer;
        this.Container = $(`<div class="evaluator"></div>`).appendTo(Container).hide();
    }
    /** Render: Render the panel. */
    public override Render() {
        this.Container.empty();
        // Evaluate the codebooks
        var Results = this.Evaluate();
        console.log(Results);
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
                .on("click", (Event, Evaluation) => this.Visualizer.FilterByOwner(true, Names.indexOf(Evaluation.Name), Evaluation.Metric));
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
                .text((Evaluation) => d3.format(".1%")(Evaluation.Value));
    }
    /** Evaluate: Evaluate all codebooks based on the network structure. */
    public Evaluate(): Record<string, CodebookEvaluation> {
        var Results: Record<string, CodebookEvaluation> = {};
        // Prepare for the results
        var Codebooks = this.Visualizer.Dataset.Codebooks;
        var Names = this.Visualizer.Dataset.Names;
        for (var I = 1; I < Codebooks.length; I++) {
            Results[Names[I]] = { Coverage: 0, Density: 0, Novelty: 0, Conformity: 0 };
        }
        // Calculate weights per node
        var Graph = BuildSemanticGraph(this.Visualizer.Dataset, this.Visualizer.Parameters);
        var Weights: Map<string, number> = new Map<string, number>();
        var TotalWeight: number = 0;
        var TotalCodebooks = Codebooks.length - 1;
        for (var Node of Graph.Nodes) {
            var Weight = Node.Data.Owners?.length ?? 0;
            if (Node.Data.Owners?.includes(0)) Weight--;
            Weight = Weight / TotalCodebooks;
            Weights.set(Node.ID, Weight);
            TotalWeight += Weight;
        }
        var AverageDensity = Graph.Nodes.length / TotalWeight;
        // Check if each node is covered by the codebooks
        var TotalNovelty = 0; var TotalConformity = 0;
        for (var Node of Graph.Nodes) {
            var Weight = Weights.get(Node.ID)!;
            var Owners = this.Visualizer.Parameters.UseNearOwners ? Node.NearOwners : Node.Owners;
            var Novel = Owners.size == 1 + (Node.Owners.has(0) ? 1 : 0);
            if (Novel) TotalNovelty += Weight;
            else TotalConformity += Weight;
            for (var Owner of Node.Owners) {
                if (Owner == 0) continue;
                Results[Names[Owner]]["Coverage"] += Weight;
                if (Novel) {
                    Results[Names[Owner]]["Novelty"] += Weight;
                } else {
                    Results[Names[Owner]]["Conformity"] += Weight;
                }
            }
        }
        // Finalize the results
        for (var I = 1; I < Codebooks.length; I++) {
            var Result = Results[Names[I]];
            Result["Coverage"] = Result["Coverage"] / TotalWeight;
            Result["Density"] = Object.keys(Codebooks[I]).length / (TotalWeight * Result["Coverage"]) / AverageDensity;
            Result["Novelty"] = Result["Novelty"] / TotalNovelty;
            Result["Conformity"] = Result["Conformity"] / TotalConformity;
        }
        return Results;
    }
}