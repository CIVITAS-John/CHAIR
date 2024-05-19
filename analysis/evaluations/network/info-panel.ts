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
    /** Panels: Panels in the info panel. */
    private Panels: Map<string, Cash> = new Map<string, Cash>();
    /** Constructor: Constructing the side panel. */
    public constructor(Container: Cash, Visualizer: Visualizer) {
        this.Visualizer = Visualizer;
        this.Container = Container;
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
    /** BuildPanelForCode: Build a panel for a code. */
    public BuildPanelForCode(Panel: Cash, Code: Code, Everything: boolean = true) {
        Panel.append($(`<h3>${Code.Label}</h3>`));
        if (Code.Owners) {
            var Owners = $(`<p class="owners"></p>`).appendTo(Panel);
            for (var Owner of Code.Owners) {
                if (Owner == 0 && Code.Owners.length > 1) continue;
                var Link = $(`<a href="javascript:void(0)" style="color: ${this.Visualizer.GetCodebookColor(Owner)}">${this.Visualizer.Dataset.Names[Owner]}</a>`).appendTo(Owners);
                if (Owner != 0) {
                    var Originals = this.FindOriginalCodes(Code, Owner);
                    Link.attr("title", Originals.map(Original => Original.Label).join(", "));
                }
            }
        }
        if (Code.Definitions && Code.Definitions.length > 0)
            Panel.append($(`<p class="definition">${Code.Definitions[0]}</p>`));
        else
            Panel.append($(`<p><i>No definition available.</i></p>`));
        if (Code.Examples && Code.Examples.length > 0) {
            Panel.append($(`<hr>`));
            if (Everything || Code.Examples.length == 1) {
                for (var Example of Code.Examples) {
                    $(`<p class="quote"><span>${Code.Examples[0]}</span></p>`).appendTo(Panel);
                }
            } else {
                $(`<p class="quote"><span>${Code.Examples[0]}</span><a href="javascript:void(0)">(${Code.Examples.length - 1} more)</a></p>`).appendTo(Panel);
            }
        }
    }
    /** FindOriginalCodes: Find the original codes from an owner. */
    public FindOriginalCodes(Source: Code, Owner: number): Code[] {
        var Codebook = this.Visualizer.Dataset.Codebooks[Owner];
        return Object.values(Codebook).filter(Code => Source.Label == Code.Label || Source.Alternatives?.includes(Code.Label));
    }
}