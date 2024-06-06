import type { Cash } from 'cash-dom';
import { Visualizer } from '../visualizer.js';
import { Node } from '../utils/schema.js';
import { Code } from '../../../../utils/schema.js';
import { GetCodebookColor } from '../utils/utils.js';
import { Panel } from './panel.js';
import { ExtractExamples, FindExampleSources, FindOriginalCodes } from '../utils/dataset.js';

/** InfoPanel: The info panel for the visualizer. */
export class InfoPanel extends Panel {
    /** Panels: Panels in the info panel. */
    private Panels: Map<string, Cash> = new Map<string, Cash>();
    /** Constructor: Constructing the side panel. */
    public constructor(Container: Cash, Visualizer: Visualizer) {
        super(Container, Visualizer);
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
        if (Everything)
            Panel.append($(`<h3>${Code.Label}</h3>`));
        else Panel.append($(`<h3></h3>`).append($(`<a href="javascript:void(0)">${Code.Label}</span>`).on("click", () => {
            this.Dialog.ShowCode(0, Code);
        })));
        if (Code.Owners && Code.Owners.length > 0) {
            var Owners = $(`<p class="owners">By: </p>`).appendTo(Panel);
            for (var Owner of Code.Owners) {
                if (Owner == 0 && Code.Owners.length > 1) continue;
                this.BuildOwnerLink(Code, FindOriginalCodes(this.Dataset.Codebooks[Owner], Code, Owner), Owner).appendTo(Owners);
            }
        } else if (Code.Alternatives && Code.Alternatives.length > 0) {
            Panel.append($(`<p class="alternatives">Consolidated from: ${Code.Alternatives.join(", ")}</p>`));
        }
        if (Code.Definitions && Code.Definitions.length > 0)
            Panel.append($(`<p class="definition">${Code.Definitions[0]}</p>`));
        else
            Panel.append($(`<p><i>No definition available.</i></p>`));
        if (Code.Examples && Code.Examples.length > 0) {
            var Examples = ExtractExamples(Code.Examples);
            Panel.append($(`<hr>`));
            if (Everything) {
                var List = $(`<ol class="quote"></ol>`).appendTo(Panel);
                for (var Example of Examples) {
                    $(`<li></li>`).appendTo(List)
                        .append(this.BuildExample(Code, Example[0], Example[1]));
                }
            } else {
                var Quote = $(`<p class="quote"></p>`).appendTo(Panel);
                $("<span></span>").appendTo(Quote).text(Examples.keys().next().value);
                if (Code.Examples.length > 1) $(`<a href="javascript:void(0)">(${Code.Examples.length - 1} more)</a>`).appendTo(Quote).on("click", () => {
                    this.Dialog.ShowCode(0, Code);
                });
            }
        }
    }
    /** BuildOwnerLink: Build a link for an owner. */
    public BuildOwnerLink(Code: Code, Sources: Code[], Owner: number)  {
        var Link = $(`<a href="javascript:void(0)" style="color: ${GetCodebookColor(Owner, this.Dataset.Codebooks.length)}">${this.Dataset.Names[Owner]}</a>`);
        if (Sources.length > 0) {
            Link.attr("title", Sources.map(Original => Original.Label).join(", "));
            Link.on("click", () => { this.Dialog.ShowCode(Owner, Code, ...Sources); });
        }
        return Link;
    }
    /** BuildExample: Build an element for a code example. */
    public BuildExample(Code: Code, Example: string, IDs: string[] = []): Cash {
        var Element = $(`<p>${Example}</p>`);
        // Add the source links
        if (IDs.length > 0)
            IDs.forEach(ID => Element.append(this.BuildSourceLink(ID)));
        // Add the owners
        if (Code.Owners && Code.Owners.length > 0) {
            var Owners = $(`<p class="owners">By: </p>`);
            for (var Owner of Code.Owners) {
                if (Owner == 0) continue;
                var Sources = FindExampleSources(this.Dataset.Codebooks[Owner], Code, Example, Owner);
                if (Sources.length == 0) continue;
                this.BuildOwnerLink(Code, Sources, Owner).appendTo(Owners);
            }
            if (Owners.children().length > 0) Element = Element.add(Owners);
        }
        return Element;
    }
    /** BuildSourceLink: Build a link for a source. */
    public BuildSourceLink(ID: string) {
        return $(`<a class="source" href="javascript:void(0)">${ID}</a>`).on("click", () => {
            this.Visualizer.Dialog.ShowChunkOf(ID);
        });
    }
}