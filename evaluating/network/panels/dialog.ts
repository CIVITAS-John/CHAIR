import type { Cash } from "cash-dom";
import d3 from "d3";

import type { Code, DataChunk, DataItem } from "../../../utils/schema.js";
import type { CodeSection } from "../sections/code.js";
import { FindOriginalCodes, GetChunks } from "../utils/dataset.js";
import { EvaluatePerCluster } from "../utils/evaluate.js";
import { OwnerFilter, UserFilter } from "../utils/filters.js";
import { FilterItemByUser } from "../utils/graph.js";
import { Shuffle } from "../utils/math.js";
import { RenderExamples, RenderItem } from "../utils/render.js";
import { GetCodebookColor } from "../utils/utils.js";
import type { Visualizer } from "../visualizer.js";

import { Panel } from "./panel.js";

/** Dialog: The dialog for the visualizer. */
export class Dialog extends Panel {
    /** Constructor: Constructing the dialog. */
    public constructor(Container: Cash, Visualizer: Visualizer) {
        super(Container, Visualizer);
        Container.children("div.close").on("click", () => {
            this.Hide();
        });
    }
    /** ShowPanel: Show a panel in the dialog. */
    private ShowPanel(Panel: Cash) {
        // Add a back button
        $('<a class="back" href="javascript:void(0)">⮜</a>')
            .on("click", () => {
                window.history.back();
            })
            .prependTo(Panel.children("h3"));
        // Show the panel
        const Content = this.Container.children("div.content");
        Content.get(0)!.scrollTop = 0;
        Content.children().remove();
        Content.append(Panel);
        this.Show();
    }
    /** ShowCode: Show a dialog for a code. */
    public ShowCode(Owner: number, Original: Code, ...Codes: Code[]) {
        this.Visualizer.PushState(`code-${encodeURIComponent(Original.Label)}-${Owner}`, () => {
            this.ShowCode(Owner, Original, ...Codes);
        });
        // Check if it's the baseline
        const IsBaseline = Owner == 0;
        if (Codes.length == 0) {
            Codes.push(Original);
        }
        // Build the panel
        const Panel = $('<div class="panel"></div>');
        for (const Code of Codes) {
            if (Panel.children().length > 0) {
                $("<hr>").appendTo(Panel);
            }
            this.InfoPanel.BuildPanelForCode(Panel, Code, true);
        }
        Panel.children("h3").append(
            $(
                `<span style="color: ${GetCodebookColor(Owner, this.Dataset.Codebooks.length)}">${this.Dataset.Names[Owner]}</span>`,
            ),
        );
        // Add a back button if it's not the baseline
        if (!IsBaseline) {
            const Source = $(
                '<p>Consolidated into: <a href="javascript:void(0)" class="back">←</a></p>',
            );
            Source.children("a")
                .text(Original.Label)
                .on("click", () => {
                    this.ShowCode(0, Original);
                });
            Panel.children("h3").after(Source);
        }
        // Show the dialog
        this.ShowPanel(Panel);
    }
    /** ShowUser: Show a dialog for a user. */
    public ShowUser(ID: string, Owners: number[] = [], ScrollTo?: string) {
        this.Visualizer.PushState(`speaker-${ID}`, () => {
            this.ShowUser(ID, Owners, ScrollTo);
        });
        // Build the panel
        const Panel = $('<div class="panel"></div>');
        // Add the title
        Panel.append(
            $(`<h3>User ${this.Visualizer.Dataset.UserIDToNicknames?.get(ID) ?? ID}</h3>`),
        );
        Panel.append($("<hr/>"));
        const Codes = this.GetGraph<Code>().Nodes;
        // Show the items
        const List = $('<ol class="quote"></ol>').appendTo(Panel);
        const Items = FilterItemByUser(this.Visualizer.Dataset.Source, [ID]);
        let TargetElement: Cash | undefined;
        Items.forEach((Item) => {
            // Show the item
            const Current = RenderItem(this.Visualizer, Item, Owners).appendTo(List);
            if (Item.ID == ScrollTo) {
                TargetElement = Current;
                Current.addClass("highlighted");
            }
            // Show related codes
            Current.append(RenderExamples(Codes, this.Visualizer, Item, Owners));
        });
        // Show the dialog
        this.ShowPanel(Panel);
        // Scroll to the target element
        if (TargetElement) {
            const Offset = TargetElement.offset()!.top;
            this.Container.children("div.content")
                .get(0)
                ?.scrollTo(0, Offset - 60);
        }
    }
    /** ShowChunk: Show a dialog for a chunk. */
    public ShowChunk(
        Name: string,
        Chunk: DataChunk<DataItem>,
        Owners: number[] = [],
        ScrollTo?: string,
    ) {
        this.Visualizer.PushState(`chunk-${Name}`, () => {
            this.ShowChunk(Name, Chunk, Owners, ScrollTo);
        });
        // Build the panel
        const Panel = $('<div class="panel"></div>');
        // Add the title
        Panel.append($(`<h3>Chunk ${Name} (${Chunk.AllItems?.length} Items)</h3>`));
        Panel.append($("<hr/>"));
        const Codes = this.GetGraph<Code>().Nodes;
        // Show the items
        const List = $('<ol class="quote"></ol>').appendTo(Panel);
        const Items = Chunk.AllItems ?? [];
        let Orthodox = Items[0].Chunk == Name;
        if (Orthodox) {
            $('<li class="split">Items inside the chunk:</li>').prependTo(List);
        }
        let TargetElement: Cash | undefined;
        Items.forEach((Item) => {
            // Show divisors when needed
            if ((Item.Chunk == Name) != Orthodox) {
                $("<hr>").appendTo(List);
                if (!Orthodox) {
                    $('<li class="split">Items before the chunk:</li>').prependTo(List);
                    $('<li class="split">Items inside the chunk:</li>').appendTo(List);
                } else {
                    $('<li class="split">Items after the chunk:</li>').appendTo(List);
                }
                Orthodox = !Orthodox;
            }
            // Show the item
            const Current = RenderItem(this.Visualizer, Item, Owners).appendTo(List);
            if (Item.ID == ScrollTo) {
                TargetElement = Current;
                Current.addClass("highlighted");
            }
            // Show related codes
            Current.append(RenderExamples(Codes, this.Visualizer, Item, Owners));
        });
        // Show the dialog
        this.ShowPanel(Panel);
        // Scroll to the target element
        if (TargetElement) {
            const Offset = TargetElement.offset()!.top;
            this.Container.children("div.content")
                .get(0)
                ?.scrollTo(0, Offset - 60);
        }
    }
    /** ShowChunkOf: Show a dialog for a chunk based on the content ID. */
    public ShowChunkOf(ID: string) {
        const Chunks = GetChunks(this.Dataset.Source.Data);
        const Chunk = Chunks.find((Chunk) =>
            Chunk.AllItems?.find(
                (Item) => Item.ID == ID && (!Item.Chunk || Item.Chunk == Chunk.ID),
            ),
        );
        if (Chunk) {
            this.ShowChunk(Chunk.ID, Chunk, undefined, ID);
        }
    }
    /** CompareCoverageByClusters: Compare the coverage by clusters. */
    public CompareCoverageByClusters() {
        this.Visualizer.PushState("compare-coverage-by-clusters", () => {
            this.CompareCoverageByClusters();
        });
        // Build the panel
        const Panel = $('<div class="panel"></div>');
        // Add the title
        const Title = $("<h3>Potential Bias of Codebooks (By Clusters)</h3>").appendTo(Panel);
        Panel.append($("<hr/>"));
        // Evaluate the coverage
        const Graph = this.GetGraph<Code>();
        const Results = EvaluatePerCluster(this.Dataset, Graph, this.Parameters);
        const Colors = d3.scaleSequential().interpolator(d3.interpolateRdYlGn).domain([-1, 1]);
        // Build the table
        this.BuildTable(
            Results,
            (Row, { Component, Coverages, Differences }, Index) => {
                Row.append(
                    $(
                        `<td class="actionable"><h4>${Index + 1}. ${Component.Representative!.Data.Label}</h4><p class="tips">${
                            Component.Nodes.length
                        } codes</p></td>`,
                    ).on("click", () => {
                        this.SidePanel.ShowPanel<CodeSection>("Codes").ShowComponent(Component);
                    }),
                );
                Coverages.forEach((Coverage, I) => {
                    const Difference = Differences[I];
                    const Color = Colors(Math.min(1, Difference));
                    const Cell = $('<td class="metric-cell actionable"></td>')
                        .text(d3.format("+.1%")(Difference))
                        .css("background", Color)
                        .css("color", d3.lab(Color).l > 70 ? "black" : "white")
                        .on("click", () => {
                            this.Visualizer.SetFilter(false, new OwnerFilter(), I + 1, false);
                            this.SidePanel.ShowPanel<CodeSection>("Codes").ShowComponent(Component);
                        })
                        .append($("<p></p>").text(d3.format(".1%")(Coverage)));
                    Row.append(Cell);
                });
            },
            ["Cluster", ...this.Dataset.Names.slice(1)],
        ).appendTo(Panel);
        // Copy to clipboard
        Title.append(
            $('<span><a href="javascript:void(0)" class="copy">Copy to Clipboard</a></span>').on(
                "click",
                () => {
                    const Table = [
                        `ID\tCluster (Representative Code)\tCodes\t${this.Dataset.Names.slice(1).join("\t")}`,
                    ];
                    Results.forEach(({ Component, Coverages, Differences }, Index) => {
                        Table.push(
                            `${Index + 1}.\t${Component.Representative!.Data.Label}\t${Component.Nodes.length}\t${Differences.map(
                                (Difference) => d3.format(".1%")(Difference).replace("−", "-"),
                            ).join("\t")}`,
                        );
                    });
                    navigator.clipboard.writeText(Table.join("\n"));
                },
            ),
        );
        // Show the dialog
        this.ShowPanel(Panel);
    }
    /** VerifiedOwnerships: Human-verified ownership information. */
    private VerifiedOwnerships = new Map<string, Map<number, number>>();
    /** ValidateCoverageByCodes: Validate the coverage by individual codes. */
    public ValidateCoverageByCodes(ScrollTo?: string) {
        this.Visualizer.PushState("validate-coverage-by-codes", () => {
            this.ValidateCoverageByCodes(ScrollTo);
        });
        // Build the panel
        const Panel = $('<div class="panel"></div>');
        let TargetElement: Cash | undefined;
        // Add the title
        const Title = $("<h3>Ownership of Codes</h3>").appendTo(Panel);
        Panel.append($("<hr/>"));
        // Get the codebooks
        const Indexes =
            this.Visualizer.GetFilter("Owner")?.Parameters ??
            this.Visualizer.Dataset.Weights!.map((Weight, Index) =>
                Weight > 0 ? Index : -1,
            ).filter((Index) => Index >= 0);
        const Names = Indexes.map((Index) => this.Dataset.Names[Index]);
        // Get the codes
        const Graph = this.GetGraph<Code>();
        const Distances = this.Visualizer.Dataset.Distances;
        const Codes = [...Graph.Nodes];
        Shuffle(Codes, 131072);
        Codes.forEach((Node) => {
            if (!this.VerifiedOwnerships.has(Node.ID)) {
                const Default = new Map<number, number>();
                for (let Index = 0; Index < this.Visualizer.Dataset.Codebooks.length; Index++) {
                    Default.set(
                        Index,
                        Node.Owners.has(Index) ? 2 : Node.NearOwners.has(Index) ? 1 : 0,
                    );
                }
                this.VerifiedOwnerships.set(Node.ID, Default);
            }
        });
        // Build the table
        this.BuildTable(
            Codes,
            (Row, Node, Index) => {
                if (Node.Data.Label == ScrollTo) {
                    TargetElement = Row;
                }
                // Show the label
                Row.append(
                    $(`<td class="actionable"><h4>${Index + 1}. ${Node.Data.Label}</h4></td>`).on(
                        "click",
                        () => {
                            this.Visualizer.PushState("validate-coverage-by-codes", () => {
                                this.ValidateCoverageByCodes(Node.Data.Label);
                            });
                            this.ShowCode(0, Node.Data);
                        },
                    ),
                );
                // Show the description
                const Description = $(
                    '<tr class="description"><td></td><td colspan="100"><p></p></td></tr>',
                );
                Description.find("p").text(`${Node.Data.Definitions?.join(", ")}`);
                Row.after(Description);
                // Show the ownerships
                for (const Codebook of Indexes) {
                    ((Index) => {
                        const Codebook = this.Dataset.Codebooks[Index];
                        const Cell = $('<td class="codes"></td>').appendTo(Row);
                        // Select
                        const Select = $(`<select>
                            <option value="0">Not related</option>
                            <option value="1">Related</option>
                            <option value="2">Very related</option>
                        </select>`).appendTo(Cell);
                        Select.on("change", () => {
                            this.VerifiedOwnerships.get(Node.ID)!.set(
                                Index,
                                parseInt(Select.val() as string),
                            );
                        }).val(this.VerifiedOwnerships.get(Node.ID)!.get(Index)!.toString());
                        // Find the related codes
                        let Related: Code[] = [];
                        if (Node.Owners.has(Index)) {
                            Related = [Node.Data];
                        } else {
                            // Find the closest owned code
                            const Owned = Codes.filter((Code) => Code.Owners.has(Index));
                            // Same logic as the links: if there are "similar" codes, use them all; otherwise, show the closest one
                            let Nearest = Owned.filter(
                                (Code) =>
                                    Distances[Node.Index][Code.Index] <= Graph.MinimumDistance,
                            );
                            if (Nearest.length == 0) {
                                Nearest = Owned.filter(
                                    (Code) =>
                                        Distances[Node.Index][Code.Index] <= Graph.MaximumDistance,
                                ).sort(
                                    (A, B) =>
                                        Distances[A.Index][Node.Index] -
                                        Distances[B.Index][Node.Index],
                                );
                                if (Nearest.length > 1) {
                                    Nearest = [Nearest[0]];
                                }
                            }
                            Related = Nearest.map((Code) => Code.Data);
                        }
                        // Show the related codes
                        for (const Original of Related) {
                            for (const Code of FindOriginalCodes(Codebook, Original, Index)) {
                                ((Original, Code) => {
                                    const Link = $('<a href="javascript:void(0)"></a>')
                                        .text(Code.Label)
                                        .appendTo(Cell);
                                    Link.on("click", () => {
                                        this.Visualizer.PushState(
                                            "validate-coverage-by-codes",
                                            () => {
                                                this.ValidateCoverageByCodes(Node.Data.Label);
                                            },
                                        );
                                        this.ShowCode(Index, Original, Code);
                                    });
                                })(Original, Code);
                            }
                        }
                    })(Codebook);
                }
            },
            ["Label", ...Names],
        )
            .addClass("code-table")
            .appendTo(Panel);
        // Copy to clipboard
        Title.append(
            $('<span><a href="javascript:void(0)" class="copy">Save to Clipboard</a></span>').on(
                "click",
                () => {
                    const Table = [`Label\t${Names.join("\t")}`];
                    Codes.forEach((Node) => {
                        const Owners = this.VerifiedOwnerships.get(Node.ID)!;
                        Table.push(
                            `${Node.Data.Label}\t${Indexes.map((Index) => Owners.get(Index)).join("\t")}`,
                        );
                    });
                    navigator.clipboard.writeText(Table.join("\n"));
                },
            ),
        );
        // Load from clipboard
        Title.append(
            $('<span><a href="javascript:void(0)" class="copy">Load from Clipboard</a></span>').on(
                "click",
                () => {
                    if (!confirm("Are you sure you want to load ownerships from the clipboard?")) {
                        return;
                    }
                    navigator.clipboard.readText().then((Text) => {
                        const Table = Text.split("\n").map((Line) => {
                            if (Line.endsWith("\r")) {
                                Line = Line.slice(0, -1);
                            }
                            return Line.split("\t");
                        });
                        const Header = Table[0];
                        const Indexes = Header.slice(1).map((Name) =>
                            this.Dataset.Names.indexOf(Name),
                        );
                        Table.slice(1).forEach(([Label, ...Owners]) => {
                            const Node = Codes.find((Node) => Node.Data.Label == Label);
                            if (!Node) {
                                return;
                            }
                            Owners.forEach((Owner, Index) =>
                                this.VerifiedOwnerships.get(Node.ID)!.set(
                                    Indexes[Index],
                                    parseInt(Owner),
                                ),
                            );
                        });
                        this.ValidateCoverageByCodes();
                    });
                },
            ),
        );
        // Clear the values
        Title.append(
            $('<span><a href="javascript:void(0)" class="copy">Clear All</a></span>').on(
                "click",
                () => {
                    if (!confirm("Are you sure you want to clear all ownerships?")) {
                        return;
                    }
                    this.VerifiedOwnerships.forEach((Owners) => {
                        Indexes.forEach((Index) => Owners.set(Index, 0));
                    });
                    this.ValidateCoverageByCodes();
                },
            ),
        );
        // Show the dialog
        this.ShowPanel(Panel);
        // Scroll to the target element
        if (TargetElement) {
            const Offset = TargetElement.offset()!.top;
            this.Container.children("div.content")
                .get(0)
                ?.scrollTo(0, Offset - 60);
        }
    }
}
