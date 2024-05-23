import type { Cash } from 'cash-dom';
import { Visualizer } from './visualizer.js';
import { Node } from './schema.js';
import { Code } from '../../../utils/schema.js';

/** InfoPanel: The info panel for the visualizer. */
export class InfoPanel {
    /** Visualizer: The visualizer in-use. */
    private Visualizer: Visualizer;
    /** Container: The container for the info panel. */
    private Container: Cash;
    /** DialogContainer: The container for the expanded dialog. */
    private DialogContainer: Cash;
    /** Panels: Panels in the info panel. */
    private Panels: Map<string, Cash> = new Map<string, Cash>();
    /** Constructor: Constructing the side panel. */
    public constructor(Container: Cash, DialogContainer: Cash, Visualizer: Visualizer) {
        this.Visualizer = Visualizer;
        this.Container = Container;
        this.DialogContainer = DialogContainer;
        DialogContainer.children("div.close").on("click", () => this.HideDialog());
        Visualizer.RegisterChosenCallback<Code>("Code", 
            (Node, Status) => this.ShowOrHidePanel<Code>(Node, Status));
    }
    /** ShowOrHidePanel: Show or hide a panel. */
    public ShowOrHidePanel<T>(Node: Node<T>, Status: boolean) {
        if (Status) {
            this.ShowPanel(Node);
        } else {
            this.HidePanel(Node);
        }
    }
    /** ShowPanel: Show a panel for a data node. */
    public ShowPanel<T>(Node: Node<T>) {
        if (this.Panels.has(Node.ID)) return;
        var Panel = this.BuildPanel(Node, false);
        this.Panels.set(Node.ID, Panel);
        this.Container.append(Panel);
    }
    /** HidePanel: Hide a panel for a data node. */
    public HidePanel<T>(Node: Node<T>) {
        this.Panels.get(Node.ID)?.remove();
        this.Panels.delete(Node.ID);
    }
    /** BuildPanel: Build a panel for a data node. */
    public BuildPanel<T>(Node: Node<T>, Everything: boolean = true) {
        var Panel = $(`<div class="panel"></div>`);
        switch (Node.Type) {
            case "Code":
                this.BuildPanelForCode(Panel, Node.Data as Code, Everything);
                break;
            default:
                Panel.append($(`<h3>Unknown node type: ${Node.Type}</h3>`));
                break;
        }
        return Panel;
    }
    /** ShowDialogForCode: Show a dialog for a code. */
    public ShowDialogForCode(Owner: number, Original: Code, ...Codes: Code[]) {
        var IsBaseline = Owner == 0;
        if (Codes.length == 0) Codes.push(Original);
        // Build the panel
        var Panel = $(`<div class="panel"></div>`);
        for (var Code of Codes) {
            if (Panel.children().length > 0) $("<hr>").appendTo(Panel);
            this.BuildPanelForCode(Panel, Code, true);
        }
        Panel.children("h3").append($(`<span style="color: ${this.Visualizer.GetCodebookColor(Owner)}">${this.Visualizer.Dataset.Names[Owner]}</span>`));
        // Add a back button if it's not the baseline
        if (!IsBaseline)
            Panel.children("h3").prepend($(`<a href="javascript:void(0)" class="back">↑</a>`)
                .attr("title", Original.Label).on("click", () => {
                    this.ShowDialogForCode(0, Original);
                }));
        // Show the dialog
        var Content = this.DialogContainer.show().children("div.content");
        Content.children().remove();
        Content.append(Panel);
    }
    /** HideDialog: Hide the dialog. */
    public HideDialog() {
        this.DialogContainer.hide();
    }
    /** BuildPanelForCode: Build a panel for a code. */
    public BuildPanelForCode(Panel: Cash, Code: Code, Everything: boolean = true) {
        if (Everything)
            Panel.append($(`<h3>${Code.Label}</h3>`));
        else Panel.append($(`<h3></h3>`).append($(`<a href="javascript:void(0)">${Code.Label}</span>`).on("click", () => {
            this.ShowDialogForCode(0, Code);
        })));
        if (Code.Owners && Code.Owners.length > 0) {
            var Owners = $(`<p class="owners">By: </p>`).appendTo(Panel);
            for (var Owner of Code.Owners) {
                if (Owner == 0 && Code.Owners.length > 1) continue;
                this.BuildOwnerLink(Code, this.FindOriginalCodes(Code, Owner), Owner).appendTo(Owners);
            }
        } else if (Code.Alternatives && Code.Alternatives.length > 0) {
            Panel.append($(`<p class="alternatives">Consolidated from: ${Code.Alternatives.join(", ")}</p>`));
        }
        if (Code.Definitions && Code.Definitions.length > 0)
            Panel.append($(`<p class="definition">${Code.Definitions[0]}</p>`));
        else
            Panel.append($(`<p><i>No definition available.</i></p>`));
        if (Code.Examples && Code.Examples.length > 0) {
            var Examples = this.ExtractExamples(Code.Examples);
            Panel.append($(`<hr>`));
            if (Everything) {
                var List = $(`<ol class="quote"></ol>`).appendTo(Panel);
                for (var Example of Examples) {
                    $(`<li class="quote"></li>`).appendTo(List)
                        .append(this.BuildExample(Code, Example[0], Example[1]));
                }
            } else {
                var Quote = $(`<p class="quote"></p>`).appendTo(Panel);
                $("<span></span>").appendTo(Quote).text(Examples.keys().next().value);
                if (Code.Examples.length > 1) $(`<a href="javascript:void(0)">(${Code.Examples.length - 1} more)</a>`).appendTo(Quote).on("click", () => {
                    this.ShowDialogForCode(0, Code);
                });
            }
        }
    }
    /** BuildOwnerLink: Build a link for an owner. */
    private BuildOwnerLink(Code: Code, Sources: Code[], Owner: number)  {
        var Link = $(`<a href="javascript:void(0)" style="color: ${this.Visualizer.GetCodebookColor(Owner)}">${this.Visualizer.Dataset.Names[Owner]}</a>`);
        if (Sources.length > 0) {
            var Originals = this.FindOriginalCodes(Code, Owner);
            Link.attr("title", Originals.map(Original => Original.Label).join(", "));
            Link.on("click", () => { this.ShowDialogForCode(Owner, Code, ...Originals) });
        }
        return Link;
    }
    /** ExtractExamples: Extract examples from a code. */
    private ExtractExamples(Examples: string[]): Map<string, string[]> {
        var Results = new Map<string, string[]>();
        var Scores = new Map<string, number>();
        // Extract the examples
        for (var Example of Examples) {
            var Index = Example.indexOf("|||");
            if (Index != -1) {
                var Quote = Example.substring(Index + 3);
                var ID = Example.substring(0, Index);
                if (!Results.has(Quote)) Results.set(Quote, []);
                Results.get(Quote)!.push(ID);
            } else {
                if (!Results.has(Example)) Results.set(Example, []);
                Results.get(Example)!.push("");
            }
        }
        // Calculate the score
        for (var [Quote, IDs] of Results) {
            Scores.set(Quote, Quote.length * IDs.length);
        }
        // Sort by the score
        var NewResults: Map<string, string[]> = new Map();
        Array.from(Scores.keys()).sort((A, B) => Scores.get(B)! - Scores.get(A)!).forEach(Key => {
            NewResults.set(Key, Results.get(Key)!);
        });
        return NewResults;
    }
    /** BuildExample: Build an element for a code example. */
    private BuildExample(Code: Code, Example: string, IDs: string[] = []): Cash {
        var Element = $(`<p>${Example}</p>`);
        if (IDs.length > 0) {
            for (var ID of IDs) {
                Element.append($(`<a class="source" href="javascript:void(0)">${ID}</a>`)).on("click", () => {
                });
            }
        }
        if (Code.Owners && Code.Owners.length > 0) {
            var Owners = $(`<p class="owners">By: </p>`);
            for (var Owner of Code.Owners) {
                if (Owner == 0) continue;
                var Sources = this.FindExampleSources(Code, Example, Owner);
                if (Sources.length == 0) continue;
                this.BuildOwnerLink(Code, Sources, Owner).appendTo(Owners);
            }
            if (Owners.children().length > 0) Element = Element.add(Owners);
        }
        return Element;
    }
    /** FindOriginalCodes: Find the original codes from an owner. */
    private FindOriginalCodes(Source: Code, Owner: number): Code[] {
        var Codebook = this.Visualizer.Dataset.Codebooks[Owner];
        return Object.values(Codebook).filter(Code => Source.Label == Code.Label || Source.Alternatives?.includes(Code.Label));
    }
    /** FindExampleSources: Find the original sources of an example from an owner. */
    private FindExampleSources(Source: Code, Example: string, Owner: number): Code[] {
        var Codes = this.FindOriginalCodes(Source, Owner);
        var SoftMatch = `|||${Example}`;
        return Codes.filter(Code => Code.Examples?.findIndex(Current => Current == Example || Current.endsWith(SoftMatch)) != -1);
    }
}