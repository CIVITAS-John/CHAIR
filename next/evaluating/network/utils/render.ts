import type { Cash } from "cash-dom";

import type { Code, DataItem } from "../../../schema.js";
import type { Node } from "../utils/schema.js";
import type { Visualizer } from "../visualizer.js";

import { findOriginalCodes } from "./dataset.js";
import { filterNodeByExample, filterNodeByOwners } from "./graph.js";
import { formatDate } from "./utils.js";

/** Render a data item. */
export const renderItem = (visualizer: Visualizer, item: DataItem, owners: number[] = []) => {
    const current = $('<li class="custom"></li>').attr("seq", item.id);
    const header = $('<p><a href="javascript:void(0)"></a> at <i></i></p>').appendTo(current);
    header
        .children("a")
        .text(item.nickname)
        .on("click", () => {
            visualizer.dialog.showUser(item.uid, owners, item.id);
        });
    header.children("i").text(formatDate(item.time));
    $("<p></p>").text(item.content).appendTo(current);
    return current;
};

/** Render the examples of a quote. */
export const renderExamples = (
    codes: Node<Code>[],
    visualizer: Visualizer,
    item: DataItem,
    owners: number[] = [],
) => {
    let examples = codes.filter((node) => filterNodeByExample(node, [item.id]));
    examples = examples.filter(
        (node) =>
            owners.length === 0 ||
            filterNodeByOwners(node, owners, visualizer.parameters.useNearOwners),
    );
    if (owners.length === 1) {
        return $('<p class="codes">Coded as:<span></span></p>')
            .children("span")
            .text(examples.map((code) => code.data.label).join(", "));
    }
    const codeList = $('<ol class="codes"></ol>');
    const cdodeItems: Cash[] = [];
    // Show the codes
    examples.forEach((code) => {
        const codeItem = $('<li class="owners"><i></i> from </li>');
        codeItem
            .children("i")
            .text(code.data.label)
            .css("cursor", "pointer")
            .on("click", () => {
                visualizer.dialog.showCode(0, code.data);
            });
        // Show the owners
        let realOwners = 0;
        for (const owner of code.data.owners ?? []) {
            if (owner === 0) {
                continue;
            }
            const originals = findOriginalCodes(
                visualizer.dataset.codebooks[owner],
                code.data,
                owner,
                item.id,
            );
            // Only show the owner if the code is related to THIS quote
            if (originals.length > 0) {
                visualizer.infoPanel.buildOwnerLink(code.data, originals, owner).appendTo(codeItem);
                realOwners++;
            }
        }
        codeItem.data("owners", realOwners);
        // Only show the code if it has owners
        if (realOwners > 0) {
            cdodeItems.push(codeItem);
        }
    });
    // Sort the codes by the number of owners
    cdodeItems.sort(
        (a, b) => parseInt(b.data("owners") as string) - parseInt(a.data("owners") as string),
    );
    cdodeItems.forEach((item) => item.appendTo(codeList));
    return codeList;
};
