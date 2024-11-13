import d3 from "d3";
import { Cash } from "cash-dom";
import { Panel } from "../panels/panel.js";
import { Visualizer } from "../visualizer.js";
import { Code } from "../../../utils/schema.js";
import { FilterNodesByOwner } from "../utils/graph.js";
import { GetCodebookColor } from "../utils/utils.js";
import { Component } from "../utils/schema.js";

/** CodeSection: The code side panel. */
export class CodeSection extends Panel {
    /** Name: The short name of the panel. */
    public Name: string = "Codes";
    /** Title: The title of the panel. */
    public override Title: string = "Consolidated Codes";
    /** Constructor: Constructing the panel. */
    public constructor(Container: Cash, Visualizer: Visualizer) {
        super(Container, Visualizer);
        this.Visualizer = Visualizer;
        this.Container = $(`<div class="code"></div>`).appendTo(Container).hide();
    }
    /** Show: Show the panel. */
    public override Show() {
        this.Container.show();
        this.ShowComponents();
    }
    /** RatioColorizer: The colorizer for ratios. */
    private RatioColorizer = d3.scaleSequential().interpolator(d3.interpolateViridis).domain([0, 1]);
    /** ShowComponents: Show all components. */
    public ShowComponents() {
        this.SetRefresh(() => {
            this.Container.empty();
            // Some notes
            $(`<p class="tips"></p>`)
                .appendTo(this.Container)
                .html(
                    `Clusters are not deterministic, only to help understand the data. Names are chosen by connectedness. <a href="javascript:void(0)">Click here</a> to visualize codebooks' coverage by clusters.`,
                )
                .find("a")
                .on("click", () => this.Visualizer.Dialog.CompareCoverageByClusters());
            // Show the components
            var Components = this.GetGraph<Code>().Components!;
            this.Container.append($(`<h3>${Components.length} Clusters, ${this.Dataset.Codes.length} Codes</h3>`));
            this.BuildTable(
                Components,
                (Row, Component, Index) => {
                    // Interactivity
                    Row.on("mouseover", (Event) => this.Visualizer.ComponentOver(Event, Component))
                        .on("mouseout", (Event) => this.Visualizer.ComponentOut(Event, Component))
                        .toggleClass("chosen", this.Visualizer.IsFilterApplied("Component", Component));
                    // Show the summary
                    var Summary = $(`<td class="cluster-cell"></td>`)
                        .attr("id", `cluster-${Component.ID}`)
                        .addClass("actionable")
                        .on("click", (Event) => {
                            if (Event.shiftKey) this.Visualizer.ComponentChosen(Event, Component);
                            else this.ShowComponent(Component);
                        })
                        .appendTo(Row);
                    Summary.append($(`<h4></h4>`).text(`#${Index + 1} ${Component.Representative!.Data.Label}`));
                    // Calculate the coverage of each codebook
                    var Codebooks: Map<number, number> = this.Dataset.Names.reduce((Previous, Name, Index) => {
                        Previous.set(Index, FilterNodesByOwner(Component.Nodes, Index, this.Parameters.UseNearOwners).length);
                        return Previous;
                    }, new Map<number, number>());
                    // Show the owners
                    var Owners = $(`<p class="owners"></p>`).appendTo(Summary);
                    this.Dataset.Names.forEach((Name, NameIndex) => {
                        var Count = Codebooks.get(NameIndex)!;
                        if (NameIndex == 0 || Count == 0) return;
                        Owners.append(
                            $(
                                `<a href="javascript:void(0)" style="color: ${GetCodebookColor(NameIndex, this.Dataset.Codebooks.length)}">${
                                    this.Dataset.Names[NameIndex]
                                }</a>`,
                            ).attr("title", `${Count} codes (${d3.format(".0%")(Count / Component.Nodes.length)})`),
                        );
                    });
                    // Show the numbers
                    var Filtered = Component.Nodes.filter((Node) => !Node.Hidden).length;
                    var Color = this.RatioColorizer(Filtered / Component.Nodes.length);
                    $(`<td class="metric-cell"></td>`)
                        .css("background-color", Color.toString())
                        .css("color", d3.lab(Color).l > 70 ? "black" : "white")
                        .appendTo(Row)
                        .text(`${Filtered}`)
                        .append($(`<p></p>`).text(d3.format(".0%")(Filtered / Component.Nodes.length)))
                        .on("click", (Event) => this.Visualizer.ComponentChosen(Event, Component));
                    $(`<td class="number-cell actionable"></td>`)
                        .appendTo(Row)
                        .text(`${Component.Nodes.length}`)
                        .append($(`<p></p>`).text(`100%`))
                        .on("click", (Event) => this.Visualizer.ComponentChosen(Event, Component));
                },
                ["Cluster", "Filtered", "Codes"],
            );
        });
    }
    /** ShowComponent: Show a code component. */
    public ShowComponent(Component: Component<Code>) {
        // Switch to the component, if not already
        if (!this.Visualizer.IsFilterApplied("Component", Component)) this.Visualizer.ComponentChosen(new Event("virtual"), Component);
        // Show the component
        this.SetRefresh(() => {
            var Colorizer = this.Visualizer.GetColorizer();
            this.Container.empty();
            // Some notes
            this.Container.append(
                $(`<p class="tips"></p>`).text(
                    "Note that clusters are not deterministic, only to help understand the data. Names are chosen from the most connected codes.",
                ),
            );
            // Show the component
            this.Container.append(
                $(`<h3>${Component.Nodes.length} Codes</h3>`).prepend(
                    this.BuildReturn(() => {
                        this.Visualizer.ComponentChosen(new Event("virtual"), Component);
                        this.ShowComponents();
                    }),
                ),
            );
            this.BuildTable(
                Component.Nodes,
                (Row, Node, Index) => {
                    // Interactivity
                    Row.on("mouseover", (Event) => this.Visualizer.NodeOver(Event, Node))
                        .on("mouseout", (Event) => this.Visualizer.NodeOut(Event, Node))
                        .toggleClass("chosen", this.Visualizer.GetStatus().ChosenNodes.includes(Node))
                        .on("click", (Event) => {
                            if (this.Visualizer.NodeChosen(Event, Node)) this.Visualizer.CenterCamera(Node.x!, Node.y!, 3);
                        });
                    // Show the summary
                    var Summary = $(`<td class="code-cell actionable"></td>`).attr("id", `code-${Node.ID}`).appendTo(Row);
                    // Calculate source codes
                    var From = (Node.Data.Alternatives ?? []).concat(Node.Data.Label).filter((Name) => {
                        return Object.values(this.Dataset.Codebooks).some((Codebook) => Codebook[Name] != undefined);
                    }).length;
                    // Colorize the code in the same way as the graph
                    var Color = Node.Hidden ? "#999999" : Colorizer.Colorize(Node);
                    Summary.append(
                        $(`<h4></h4>`)
                            .append($(`<svg width="2" height="2" viewbox="0 0 2 2"><circle r="1" cx="1" cy="1" fill="${Color}"></circle></svg>`))
                            .append($(`<span></span>`).text(Node.Data.Label)),
                    );
                    Summary.append($(`<p class="tips"></p>`).text(`From ${From} codes`));
                    // Show the consensus
                    var Owners = $(`<td class="metric-cell"></td>`).appendTo(Row);
                    // var OwnerSet = this.Parameters.UseNearOwners ? Node.Owners : Node.NearOwners;
                    // var Count = [...OwnerSet].filter(Owner => this.Dataset.Weights![Owner] !== 0).length;
                    var Ratio = Node.TotalWeight / this.Dataset.TotalWeight!;
                    var Color = this.RatioColorizer(Ratio);
                    Owners.text(d3.format(".0%")(Ratio))
                        .css("background-color", Color.toString())
                        .css("color", d3.lab(Color).l > 70 ? "black" : "white");
                    // Show the examples
                    Row.append($(`<td class="number-cell actionable"></td>`).text(`${Node.Data.Examples?.length ?? 0}`));
                },
                ["Code", "Consensus", "Cases"],
            );
        });
    }
}
