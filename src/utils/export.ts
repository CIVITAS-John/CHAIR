import Excel from "exceljs";

import { mergeCodebook } from "../consolidating/codebooks.js";
import type { Code, CodedThread, CodedThreads, DataChunk, DataItem, Dataset } from "../schema.js";
import type { IDStrFunc } from "../steps/base-step.js";

import { logger } from "./logger.js";
import { assembleExampleFrom, getAllItems } from "./misc.js";

const { Workbook } = Excel;

const getCellValueString = (row: Excel.Row, cell: string) => {
    const cellValue = row.getCell(cell).value;
    return cellValue === null || cellValue === undefined
        ? ""
        : typeof cellValue === "string"
          ? cellValue
          : JSON.stringify(cellValue);
};

/** Get the row height for the given content. */
export const getRowHeight = (content: string, width: number) =>
    content
        .split("\n")
        .map((text) => Math.max(1, Math.ceil(text.length / width)))
        .reduce((acc, cur) => acc + cur) *
        15 +
    3;

/** Sort an array of codes. */
export const sortCodes = (codes: Code[]) =>
    [...codes].sort((A, B) => {
        const category = (A.categories?.sort().join("; ") ?? "").localeCompare(
            B.categories?.sort().join("; ") ?? "",
        );
        return category !== 0 ? category : A.label.localeCompare(B.label);
    });

// // Export: Export the JSON data into human-readable formats.
// // ExportMessages: Export messages into markdown.
// export function ExportMessages(Messages: Message[], Originals?: Message[]): string {
//     let Result = "";
//     let LastConversation = "-1";
//     for (let I = 0; I < Messages.length; I++) {
//         const Message = Messages[I];
//         // Write a separator if the time gap is too long
//         if (Message.chunk && LastConversation !== Message.chunk) {
//             Result += `\n=== ${Message.chunk}\n\n`;
//             LastConversation = Message.chunk;
//         }
//         // Export the message
//         Result += `${Message.ID}. **P${Message.uid}, ${Message.nickname}**`;
//         if (Originals !== undefined && Originals[I].nickname !== Message.nickname) {
//             Result += ` (${Originals[I].nickname})`;
//         }
//         Result += `: ${Message.Time.toLocaleString("en-US", { timeZone: "Asia/Shanghai" })}\n`;
//         Result += Message.Content;
//         if (Originals !== undefined && Message.Content !== Originals[I].Content) {
//             Result += `\n${Originals[I].Content}`;
//         }
//         Result += "\n";
//     }
//     return Result;
// }

// // ExportProjects: Export projects into markdown.
// export function ExportProjects(Projects: Project[], Originals?: Project[]): string {
//     let Result = "";
//     for (let I = 0; I < Projects.length; I++) {
//         const Project = Projects[I];
//         const Original = Originals ? Originals[I] : undefined;
//         // Title
//         Result += `## ${Projects[I].Title} (${Projects[I].ID})`;
//         if (Original && Original.Title !== Project.Title) {
//             Result += `* Title: ${Original.Title}\n`;
//         }
//         // Author
//         Result += `\n* Author: P${Projects[I].uid}, ${Projects[I].nickname}`;
//         if (Original && Original.nickname !== Project.nickname) {
//             Result += ` (${Original.nickname})`;
//         }
//         // Tags
//         Result += `\n* Tags: ${Projects[I].Tags.join(", ")}`;
//         // Time
//         Result += `\n* Time: ${Projects[I].Time.toLocaleString("en-US", { timeZone: "Asia/Shanghai" })}`;
//         // Visits
//         Result += `\n* Popularity: Visits ${Projects[I].Visits}, Stars ${Projects[I].Stars}, Supports ${Projects[I].Supports}`;
//         // Image
//         Result += `\n![Cover](${Projects[I].Cover})`;
//         // Content
//         Result += `\n\n### Content\n${Projects[I].Content}`;
//         if (Original && Original.Content !== Project.Content) {
//             Result += `\n${Original.Content}`;
//         }
//         // Comments
//         if (Project.items) {
//             Result += "\n\n### Comments";
//             Project.items.reverse(); // Here I had a little bug, the original exports have comments in reversed order.
//             for (let N = 0; N < Project.items.length; N++) {
//                 const Comment = Project.items[N];
//                 const OriginalComment = Original ? Original.items[N] : undefined;
//                 Result += `\n${N + 1}. **P${Comment.uid}, ${Comment.nickname}**`;
//                 if (OriginalComment && Comment.nickname !== OriginalComment.nickname) {
//                     Result += ` (${OriginalComment.nickname})`;
//                 }
//                 Result += `: ${Comment.Time.toLocaleString("en-US", { timeZone: "Asia/Shanghai" })}\n`;
//                 Result += Comment.Content;
//                 if (OriginalComment && Comment.Content !== OriginalComment.Content) {
//                     Result += `\n${OriginalComment.Content}`;
//                 }
//             }
//         }
//         Result += "\n\n";
//     }
//     return Result;
// }

/** Export Chunks into an Excel workbook for coding. */
export const exportChunksForCoding = <T extends DataItem>(
    idStr: IDStrFunc,
    chunks: DataChunk<T>[],
    analyses: CodedThreads = { threads: {} },
) => {
    const _id = idStr("exportChunksForCoding");

    logger.info(`Exporting ${chunks.length} chunks to Excel`, _id);
    const book = new Workbook();
    // const Consolidated = false;
    const consolidation = new Map<string, string>();
    // Whether the codebook is consolidated
    if (analyses.codebook) {
        for (const code of Object.values(analyses.codebook)) {
            if (code.alternatives?.length) {
                code.alternatives.forEach((alternative) =>
                    consolidation.set(alternative, code.label),
                );
            }
        }
        // consolidated = consolidation.size > 0;
    }
    // Export the Chunks
    for (const chunk of chunks) {
        logger.debug(`Exporting chunk ${chunk.id}`, _id);
        const messages = chunk.items;
        const analysis = analyses.threads[chunk.id] ?? analyses.threads[chunk.id.substring(2)];
        // Write into Excel worksheet
        const sheet = book.addWorksheet(chunk.id, {
            views: [{ state: "frozen", xSplit: 1, ySplit: 1 }],
        });
        // Set the columns
        sheet.columns = [
            { header: "ID", key: "ID", width: 8 },
            { header: "CID", key: "CID", width: 6 },
            { header: "SID", key: "SID", width: 6 },
            { header: "Nickname", key: "Nickname", width: 16 },
            { header: "Time", key: "Time", width: 13, style: { numFmt: "mm/dd hh:MM" } },
            { header: "In", key: "In", width: 4 },
            { header: "Content", key: "Content", width: 120 },
            { header: "Codes", key: "Codes", width: 80 },
            { header: "Memo", key: "Memo", width: 80 },
            { header: "Consolidated", key: "Consolidated", width: 80 },
        ];
        sheet.getRow(1).alignment = { vertical: "middle", wrapText: true };
        sheet.getRow(1).font = {
            name: "Lato",
            family: 4,
            size: 12,
            bold: true,
        };
        sheet.properties.defaultRowHeight = 18;
        // Write the messages
        for (const message of messages) {
            logger.debug(`Exporting message ${message.id}`, _id);
            // TODO: Support subchunks
            if ("items" in message) {
                logger.warn("Subchunks are not yet supported, skipping", _id);
                continue;
            }
            const codes =
                typeof analysis === "undefined"
                    ? undefined
                    : (analysis.items[message.id] ?? analysis.items[message.id.substring(2)]).codes;
            message.chunk = message.chunk ?? chunk.id;
            const columns = {
                ID: message.id,
                CID: message.chunk,
                SID: Number.isNaN(parseInt(message.uid)) ? message.uid : parseInt(message.uid),
                Nickname: message.nickname,
                Time: message.time,
                In: message.chunk === chunk.id ? "Y" : "N",
                Content: message.content,
                Codes: codes?.join(", ") ?? "",
                Memo: message.tags?.join(", ") ?? "",
                Consolidated: [
                    ...new Set(codes?.map((Code) => consolidation.get(Code) ?? Code) ?? []),
                ].join(", "),
            };
            const Row = sheet.addRow(columns);
            Row.font = {
                name: "Lato",
                family: 4,
                size: 12,
                color: { argb: message.chunk === chunk.id ? "FF000000" : "FF666666" },
            };
            Row.height = getRowHeight(message.content, 120);
            Row.alignment = { vertical: "middle" };
            Row.getCell("Content").alignment = { vertical: "middle", wrapText: true };
            Row.getCell("Memo").alignment = { vertical: "middle", wrapText: true };
        }
        sheet.addRow({});
        logger.debug(`Exported ${messages.length} messages`, _id);
        // Extra row for notes
        const addExtraRow = (id: number, name: string, content: string) => {
            const lastRow = sheet.addRow({ ID: id, Nickname: name, Content: content });
            lastRow.height = Math.max(30, getRowHeight(content, 120));
            lastRow.alignment = { vertical: "middle" };
            lastRow.getCell("Content").alignment = { vertical: "middle", wrapText: true };
            lastRow.font = {
                name: "Lato",
                family: 4,
                size: 12,
            };
        };
        addExtraRow(
            -1,
            "Thoughts",
            (typeof analysis === "undefined" ? null : analysis.plan) ??
                "(Optional) Your thoughts before coding the chunk.",
        );
        addExtraRow(
            -2,
            "Summary",
            (typeof analysis === "undefined" ? null : analysis.summary) ??
                "The summary of the chunk.",
        );
        addExtraRow(
            -3,
            "Reflection",
            (typeof analysis === "undefined" ? null : analysis.reflection) ??
                "Your reflections after coding the chunk.",
        );
        logger.debug("Finished exporting chunk", _id);
    }
    // Export the codebook
    exportCodebook(idStr, book, analyses);
    logger.info(`Exported ${chunks.length} chunks to Excel`, _id);
    return book;
};

export const importCodes = async (
    idStr: IDStrFunc,
    dataset: Dataset<DataChunk<DataItem>>,
    path: string,
    codebookSheet = "Codebook",
): Promise<CodedThreads> => {
    const _id = idStr("importCodes");
    logger.info(`Importing codes from ${path}`, _id);

    const workbook = new Workbook();
    await workbook.xlsx.readFile(path);
    const allItems = getAllItems(dataset);

    // Initialize the analyses object
    const analyses: CodedThreads = {
        threads: {},
    };

    // Process each worksheet (tab) except the Codebook
    workbook.eachSheet((worksheet) => {
        if (worksheet.name === codebookSheet) return; // Skip codebook, will handle separately

        const chunkId = worksheet.name;
        logger.debug(`Importing chunk ${chunkId}`, _id);

        // Initialize the thread analysis
        const analysis: CodedThread = {
            id: chunkId,
            codes: {},
            items: {},
            iteration: 0,
        };

        let msgs = 0;

        // Find the column keys (not all worksheet will include all columns)
        for (const column of worksheet.columns) {
            if (!column.values?.[1]) continue; // Skip empty columns
            const key = column.values[1];
            column.key = typeof key === "string" ? key : JSON.stringify(key);
        }

        // Process each row in the worksheet
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return; // Skip header row

            const id = row.getCell("ID").value;
            const name = getCellValueString(row, "Nickname");
            // const sid = getCellValueString(row, "SID");
            const content = getCellValueString(row, "Content");

            // Check if this is a special row (thoughts, summary, reflection)
            if (typeof id === "number" && id < 0) {
                switch (id) {
                    case -1:
                        if (
                            name === "Thoughts" &&
                            content !== "(Optional) Your thoughts before coding the chunk."
                        ) {
                            analysis.plan = content;
                        }
                        break;
                    case -2:
                        if (name === "Summary" && content !== "The summary of the chunk.") {
                            analysis.summary = content;
                        }
                        break;
                    case -3:
                        if (
                            name === "Reflection" &&
                            content !== "Your reflections after coding the chunk."
                        ) {
                            analysis.reflection = content;
                        }
                        break;
                }
                return;
            }

            // Skip empty rows
            if (!id) return;

            const codesValue = getCellValueString(row, "Codes");
            const codes = codesValue ? codesValue.split(/[,;\n]+/).filter(Boolean) : undefined;

            // Skip rows without codes
            if (!codes) return;

            // Add item to analysis
            const messageId = typeof id === "string" ? id : JSON.stringify(id);
            const item = {
                id: messageId,
                codes,
            };
            analysis.items[messageId] = item;

            // Add item to the list of codes
            for (const code of item.codes) {
                const current: Code = analysis.codes[code] ?? { label: code, examples: [] };
                analysis.codes[code] = current;
                // find the message
                const message = allItems.find((item) => item.id === messageId);
                if (!message) {
                    logger.warn(`Message ${messageId} not found in chunk ${chunkId}`, _id);
                    continue;
                }
                // assemble the message
                const contentWithID = assembleExampleFrom(dataset, message);
                if (content !== "" && !current.examples?.includes(contentWithID)) {
                    current.examples?.push(contentWithID);
                }
            }

            ++msgs;
        });

        if (msgs === 0) {
            logger.warn(`No valid coded messages found in chunk ${chunkId}`, _id);
            return;
        }

        analyses.threads[chunkId] = analysis;

        logger.debug(`Imported ${msgs} coded messages for chunk ${chunkId}`, _id);
    });

    // Import the codebook
    try {
        analyses.codebook = await importCodebook(idStr, path, codebookSheet);
        logger.info(`Successfully imported codebook from ${path}`, _id);
    } catch (error) {
        // Build the codebook
        logger.warn(
            `Failed to import codebook from ${path}: ${error instanceof Error ? error.message : JSON.stringify(error)}, building one`,
            _id,
        );
        mergeCodebook(analyses);
    }

    logger.info(
        `Imported coded data from ${path}: ${Object.keys(analyses.threads).length} threads`,
        _id,
    );
    return analyses;
};

/** Export a codebook into an Excel workbook. */
export const exportCodebook = (
    idStr: IDStrFunc,
    book: Excel.Workbook,
    analyses: CodedThreads = { threads: {} },
    name = "Codebook",
) => {
    const _id = idStr("exportCodebook");

    logger.info("Exporting codebook to Excel", _id);
    const sheet = book.addWorksheet(name, {
        views: [{ state: "frozen", xSplit: 1, ySplit: 1 }],
    });
    // Set the columns
    sheet.columns = [
        { header: "Label", key: "Label", width: 30 },
        { header: "Category", key: "Category", width: 30 },
        { header: "Definition", key: "Definition", width: 80 },
        { header: "Examples", key: "Examples", width: 120 },
        { header: "Alternatives", key: "Alternatives", width: 40 },
    ];
    sheet.getRow(1).alignment = { vertical: "middle", wrapText: true };
    sheet.getRow(1).font = {
        name: "Lato",
        family: 4,
        size: 12,
        bold: true,
    };
    sheet.properties.defaultRowHeight = 18;
    if (analyses.codebook === undefined) {
        logger.warn("No codebook to export", _id);
        return;
    }

    // Write the codebook
    let codes = Object.values(analyses.codebook);
    // Sort the codes
    codes = sortCodes(codes);
    // Write the codes
    for (const code of codes) {
        logger.debug(`Exporting code ${code.label}`, _id);
        const categories =
            code.categories
                ?.map((category) =>
                    (code.categories ?? []).length > 1 ? `* ${category}` : category,
                )
                .join("\n") ?? "";
        const definitions =
            code.definitions
                ?.map((Definition) =>
                    (code.definitions ?? []).length > 1 ? `* ${Definition}` : Definition,
                )
                .join("\n") ?? "";
        const examples =
            code.examples
                ?.map((Example) =>
                    (code.examples ?? []).length > 1
                        ? `* ${Example.replace("|||", ": ")}`
                        : Example.replace("|||", ": "),
                )
                .join("\n") ?? "";
        const alternatives = code.alternatives?.map((Code) => `* ${Code}`).join("\n") ?? "";
        const row = sheet.addRow({
            Label: code.label,
            Category: categories,
            Definition: definitions,
            Examples: examples,
            Alternatives: alternatives,
        });
        row.font = {
            name: "Lato",
            family: 4,
            size: 12,
        };
        row.height = Math.max(
            30,
            getRowHeight(categories, 100),
            getRowHeight(definitions, 100),
            getRowHeight(examples, 100),
        );
        row.alignment = { vertical: "middle" };
        row.getCell("Category").alignment = { vertical: "middle", wrapText: true };
        row.getCell("Definition").alignment = { vertical: "middle", wrapText: true };
        row.getCell("Examples").alignment = { vertical: "middle", wrapText: true };
        row.getCell("Alternatives").alignment = { vertical: "middle", wrapText: true };
        logger.debug(`Exported code ${code.label}`, _id);
    }
    logger.info("Exported codebook to Excel", _id);
};

/** Import a codebook from an Excel workbook. */
export const importCodebook = async (
    idStr: IDStrFunc,
    path: string,
    name = "Codebook",
): Promise<Record<string, Code>> => {
    const _id = idStr("importCodebook");

    logger.info(`Importing codebook from ${path}`, _id);
    const workbook = new Workbook();
    await workbook.xlsx.readFile(path);

    const sheet = workbook.getWorksheet(name);
    if (!sheet) {
        throw new Error(`Worksheet "${name}" not found in ${path}`);
    }

    const codebook: Record<string, Code> = {};

    // Skip the header row (row 1)
    sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;

        const label = getCellValueString(row, "Label").trim();
        if (!label) return; // Skip rows without a label

        logger.debug(`Importing code ${label}`, _id);

        const categoryText = getCellValueString(row, "Category");
        const definitionText = getCellValueString(row, "Definition");
        const examplesText = getCellValueString(row, "Examples");
        const alternativesText = getCellValueString(row, "Alternatives");

        // Parse categories (handle bullet points)
        const categories = categoryText
            ? categoryText
                  .split("\n")
                  .map((c) => c.trim().replace(/^\* /, ""))
                  .filter(Boolean)
            : undefined;

        // Parse definitions (handle bullet points)
        const definitions = definitionText
            ? definitionText
                  .split("\n")
                  .map((d) => d.trim().replace(/^\* /, ""))
                  .filter(Boolean)
            : undefined;

        // Parse examples (handle bullet points and convert ": " back to "|||")
        const examples = examplesText
            ? examplesText
                  .split("\n")
                  .map((e) => {
                      e = e.trim().replace(/^\* /, "");
                      // Replace the first ": " with "|||"
                      const colonIndex = e.indexOf(": ");
                      if (colonIndex > 0) {
                          e = `${e.substring(0, colonIndex)}|||${e.substring(colonIndex + 2)}`;
                      }
                      return e;
                  })
                  .filter(Boolean)
            : undefined;

        // Parse alternatives (handle bullet points)
        const alternatives = alternativesText
            ? alternativesText
                  .split("\n")
                  .map((a) => a.trim().replace(/^\* /, ""))
                  .filter(Boolean)
            : undefined;

        // Create the code object
        codebook[label] = {
            label,
            categories,
            definitions,
            examples,
            alternatives,
        };

        logger.debug(`Imported code ${label}`, _id);
    });

    const codeCount = Object.keys(codebook).length;
    if (codeCount === 0) {
        logger.warn("No codes found in the codebook", _id);
        return codebook;
    }
    logger.info(`Imported ${codeCount} codes from codebook`, _id);

    return codebook;
};
