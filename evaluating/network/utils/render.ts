import type { Cash } from "cash-dom";

import type { Code, DataItem } from "../../../utils/schema.js";
import type { Node } from "../utils/schema.js";
import type { Visualizer } from "../visualizer.js";

import { FindOriginalCodes } from "./dataset.js";
import { FilterNodeByExample, FilterNodeByOwners } from "./graph.js";
import { FormatDate } from "./utils.js";

/** RenderItem: Render a data item. */
export function RenderItem(Visualizer: Visualizer, Item: DataItem, Owners: number[] = []): Cash {
    const Current = $('<li class="custom"></li>').attr("seq", Item.ID);
    const Header = $('<p><a href="javascript:void(0)"></a> at <i></i></p>').appendTo(Current);
    Header.children("a")
        .text(Item.Nickname)
        .on("click", () => {
            Visualizer.Dialog.ShowUser(Item.UserID, Owners, Item.ID);
        });
    Header.children("i").text(FormatDate(Item.Time));
    $("<p></p>").text(Item.Content).appendTo(Current);
    return Current;
}

/** RenderExamples: Render the examples of a quote. */
export function RenderExamples(Codes: Node<Code>[], Visualizer: Visualizer, Item: DataItem, Owners: number[] = []): Cash {
    let Examples = Codes.filter((Node) => FilterNodeByExample(Node, [Item.ID]));
    Examples = Examples.filter((Node) => Owners.length === 0 || FilterNodeByOwners(Node, Owners, Visualizer.Parameters.UseNearOwners));
    if (Owners.length === 1) {
        return $('<p class="codes">Coded as:<span></span></p>')
            .children("span")
            .text(Examples.map((Code) => Code.Data.Label).join(", "));
    }
    const CodeList = $('<ol class="codes"></ol>');
    const CodeItems: Cash[] = [];
    // Show the codes
    Examples.forEach((Code) => {
        if (!Code.Data.Owners) {
            throw new Error("Owner codebooks not available.");
        }
        const CodeItem = $('<li class="owners"><i></i> from </li>');
        CodeItem.children("i")
            .text(Code.Data.Label)
            .css("cursor", "pointer")
            .on("click", () => {
                Visualizer.Dialog.ShowCode(0, Code.Data);
            });
        // Show the owners
        let RealOwners = 0;
        for (const Owner of Code.Data.Owners) {
            if (Owner === 0) {
                continue;
            }
            const Originals = FindOriginalCodes(Visualizer.Dataset.Codebooks[Owner], Code.Data, Owner, Item.ID);
            // Only show the owner if the code is related to THIS quote
            if (Originals.length > 0) {
                Visualizer.InfoPanel.BuildOwnerLink(Code.Data, Originals, Owner).appendTo(CodeItem);
                RealOwners++;
            }
        }
        CodeItem.data("owners", RealOwners);
        // Only show the code if it has owners
        if (RealOwners > 0) {
            CodeItems.push(CodeItem);
        }
    });
    // Sort the codes by the number of owners
    CodeItems.sort((A, B) => parseInt(B.data("owners") as string) - parseInt(A.data("owners") as string));
    CodeItems.forEach((Item) => Item.appendTo(CodeList));
    return CodeList;
}
