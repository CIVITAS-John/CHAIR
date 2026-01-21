/**
 * Excel Import for Qualitative Coding
 *
 * This module handles importing coded results from Excel files:
 * - Import coded results back from Excel into the analysis pipeline
 * - Import codebook with categories, definitions, examples, alternatives
 *
 * The "|||" Separator Convention:
 * - Examples stored internally as: "ID|||Speaker: Content"
 * - When importing from Excel: ": " converted back to "|||" (first occurrence only)
 * - Why "|||"?
 *   - Unlikely to appear in natural text
 *   - Easy to split/join programmatically
 *   - Preserves structure for ID extraction when needed
 *
 * Excel Format:
 * - Data sheets: ID, CID, SID, Nickname, Time, In, Content, Codes, Memo, Consolidated
 * - Codebook sheet: Label, Category, Definition, Examples, Alternatives
 * - Multiple items separated by newlines with "* " bullet points
 *
 * @example
 * // Import coded results
 * const codedData = await importCodes(dataset, "coding.xlsx");
 */

import Excel from "exceljs";

import { mergeCodebook } from "../../consolidating/codebooks.js";
import type { Code, CodedThread, CodedThreads, DataChunk, DataItem, Dataset } from "../../schema.js";

import { logger } from "../core/logger.js";
import { assembleExampleFrom, getAllItems } from "../core/misc.js";

const { Workbook } = Excel;

/**
 * Extract cell value as string from Excel row
 *
 * @param row - Excel row object
 * @param cell - Cell identifier (column letter, number, or name via mapping)
 * @param columnMapping - Optional mapping of column names to column numbers
 * @returns Cell value as string, or empty string if null/undefined
 * @internal
 */
const getCellValueString = (row: Excel.Row, cell: string | number, columnMapping?: Record<string, number>) => {
    try {
        // If columnMapping is provided and cell is a string, try to resolve it
        let cellRef: string | number = cell;
        if (columnMapping && typeof cell === "string" && columnMapping[cell]) {
            cellRef = columnMapping[cell];
        }

        const cellValue = row.getCell(cellRef).value;
        return cellValue === null || cellValue === undefined
            ? ""
            : typeof cellValue === "string"
                ? cellValue
                : JSON.stringify(cellValue);
    } catch {
        return "";
        // throw new Error("Couldn't find the cell with the label: " + cell);
    }
};

/** Import coded results from an Excel workbook. */
export const importCodes = (
    dataset: Dataset<DataChunk<DataItem>>,
    path: string,
    codebookSheet = "Codebook",
): Promise<CodedThreads> =>
    logger.withDefaultSource("importCodes", async () => {
        logger.info(`Importing codes from ${path}`);

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
            logger.debug(`Importing chunk ${chunkId}`);

            // Initialize the thread analysis
            const analysis: CodedThread = {
                id: chunkId,
                codes: {},
                items: {},
                iteration: 0,
            };

            let msgs = 0;

            // Extract column headers from the first row
            const headerRow = worksheet.getRow(1);
            const columnMapping: Record<string, number> = {};

            headerRow.eachCell((cell, colNumber) => {
                const headerValue = cell.value;
                if (headerValue) {
                    const headerName = typeof headerValue === "string"
                        ? headerValue
                        : JSON.stringify(headerValue);
                    columnMapping[headerName] = colNumber;
                }
            });

            // Process each row in the worksheet
            worksheet.eachRow((row, rowNumber) => {
                if (rowNumber === 1) return; // Skip header row

                // If the row has no ID cell, use (the row number - 1) as ID
                const idCell = columnMapping["ID"] ? row.getCell(columnMapping["ID"]) : row.getCell("ID");
                const id = idCell.value ?? rowNumber - 1;
                const name = getCellValueString(row, "Nickname", columnMapping);
                // const sid = getCellValueString(row, "SID", columnMapping);
                const content = getCellValueString(row, "Content", columnMapping);

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
                if (!content) return;

                const codesValue = getCellValueString(row, "Codes", columnMapping);
                const codes = codesValue
                    ? codesValue
                          .split(/[,;\n]+/)
                          .filter(Boolean)
                          .map((code) => code.trim())
                    : undefined;

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
                        logger.warn(`Message ${messageId} not found in chunk ${chunkId}`);
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
                logger.warn(`No valid coded messages found in chunk ${chunkId}`);
                return;
            }

            analyses.threads[chunkId] = analysis;

            logger.debug(`Imported ${msgs} coded messages for chunk ${chunkId}`);
        });

        // Import the codebook
        try {
            analyses.codebook = await importCodebook(path, codebookSheet);
            logger.info(`Successfully imported codebook from ${path}`);
        } catch (error) {
            // Build the codebook
            logger.warn(
                `Failed to import codebook from ${path}, building one: ${error instanceof Error ? `${error.message}\n${error.stack}` : JSON.stringify(error)}`,
            );
            mergeCodebook(analyses);
        }

        logger.info(
            `Imported coded data from ${path}: ${Object.keys(analyses.threads).length} threads`,
        );
        return analyses;
    });

/** Import a codebook from an Excel workbook. */
export const importCodebook = (path: string, name = "Codebook"): Promise<Record<string, Code>> =>
    logger.withDefaultSource("importCodebook", async () => {
        logger.info(`Importing codebook from ${path}`);
        const workbook = new Workbook();
        await workbook.xlsx.readFile(path);

        const sheet = workbook.getWorksheet(name);
        if (!sheet) {
            throw new Error(`Worksheet "${name}" not found in ${path}`);
        }

        const codebook: Record<string, Code> = {};

        // Extract column headers from the first row
        const headerRow = sheet.getRow(1);
        const columnMapping: Record<string, number> = {};

        headerRow.eachCell((cell, colNumber) => {
            const headerValue = cell.value;
            if (headerValue) {
                const headerName = typeof headerValue === "string"
                    ? headerValue
                    : JSON.stringify(headerValue);
                columnMapping[headerName] = colNumber;
            }
        });

        // Process each row (skip the header row)
        sheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return;

            const label = getCellValueString(row, "Label", columnMapping).trim();
            if (!label) return; // Skip rows without a label

            logger.debug(`Importing code ${label}`);

            const categoryText = getCellValueString(row, "Category", columnMapping);
            const definitionText = getCellValueString(row, "Definition", columnMapping);
            const examplesText = getCellValueString(row, "Examples", columnMapping);
            const alternativesText = getCellValueString(row, "Alternatives", columnMapping);

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

            logger.debug(`Imported code ${label}`);
        });

        const codeCount = Object.keys(codebook).length;
        if (codeCount === 0) {
            logger.warn("No codes found in the codebook");
            return codebook;
        }
        logger.info(`Imported ${codeCount} codes from codebook`);

        return codebook;
    });