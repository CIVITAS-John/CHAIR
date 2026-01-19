/**
 * QDPX Utility Module
 *
 * Converts REFI-QDA QDPX files to our JSON dataset format.
 * QDPX files are zip archives containing qualitative research data including sources, codebooks, and coded segments.
 *
 * Conversion process:
 * 1. Unzip QDPX file
 * 2. Read project.qde XML file
 * 3. Convert codebook with bottom-up filtering
 * 4. Convert TextSources to RawDataChunks with paragraphs as DataItems
 * 5. Extract coded segments per coder into CodedThreads
 * 6. Write JSON files matching our dataset format
 */

import { writeFile, mkdir, readFile } from "fs/promises";
import { existsSync } from "fs";
import { join, basename } from "path";
import { parseStringPromise } from "xml2js";
import AdmZip from "adm-zip";

import type { Code, Codebook, RawDataChunk, RawDataItem } from "../../schema.js";
import { exportChunksForCoding } from "./export.js";
import type {
    ChunkContentResult,
    RefiCode,
    RefiCoding,
    RefiPlainTextSelection,
    RefiProject,
    RefiTextSource,
    RefiUser,
} from "./qdpx.schema.js";

/**
 * Default content chunking function with smart dialog detection
 *
 * Uses line-by-line scanning to detect speaker dialog formats.
 *
 * Supported formats:
 * 1. Speaker on separate line:
 *    ```
 *    Alice:
 *    Hello world
 *    ```
 * 2. Speaker inline with content:
 *    ```
 *    Alice: Hello world
 *    ```
 *
 * Strategy:
 * - Scan line by line, tracking current speaker
 * - Speaker-only line (Name:) → update current speaker
 * - Inline speaker (Name: Content) → emit chunk immediately
 * - Regular content → accumulate until paragraph break or speaker change
 * - Empty line → flush accumulated content as chunk
 *
 * @param text - The full text content to split
 * @returns Array of chunks with content, positions, and optional nickname
 */
export function defaultChunkContent(text: string): ChunkContentResult[] {
    const chunks: ChunkContentResult[] = [];
    const lines = text.split('\n');

    let currentSpeaker: string | undefined;
    let contentLines: string[] = [];
    let contentStartPos: number | undefined;
    let currentLinePos = 0;

    /**
     * Flush accumulated content as a chunk
     */
    const flushContent = () => {
        if (contentLines.length === 0 || contentStartPos === undefined) {
            return;
        }

        const content = contentLines.join('\n').trim();
        if (content.length === 0) {
            contentLines = [];
            contentStartPos = undefined;
            return;
        }

        // Find actual start/end positions of trimmed content
        const combinedContent = contentLines.join('\n');
        const leadingWhitespace = combinedContent.match(/^\s*/)?.[0].length || 0;
        const trailingWhitespace = combinedContent.match(/\s*$/)?.[0].length || 0;

        const chunk: ChunkContentResult = {
            content,
            startPosition: contentStartPos + leadingWhitespace,
            endPosition: contentStartPos + combinedContent.length - trailingWhitespace - 1,
        };

        if (currentSpeaker) {
            chunk.nickname = currentSpeaker;
        }

        chunks.push(chunk);

        // Reset accumulation
        contentLines = [];
        contentStartPos = undefined;
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        // Speaker-only line: "Name:"
        const speakerOnlyMatch = trimmedLine.match(/^(.{1,20}):\s*$/);

        // Inline speaker: "Name: Content"
        const inlineSpeakerMatch = trimmedLine.match(/^(.{1,20}):\s+(.+)$/);

        if (speakerOnlyMatch) {
            // Speaker-only line detected
            flushContent(); // Flush any accumulated content first
            currentSpeaker = speakerOnlyMatch[1].trim();

        } else if (inlineSpeakerMatch) {
            // Inline speaker detected
            flushContent(); // Flush any accumulated content first

            const speaker = inlineSpeakerMatch[1].trim();
            const content = inlineSpeakerMatch[2].trim();

            // Find content position within the line
            const colonIndex = line.indexOf(':');
            let contentStartInLine = colonIndex + 1;

            // Skip whitespace after colon
            while (contentStartInLine < line.length && /\s/.test(line[contentStartInLine])) {
                contentStartInLine++;
            }

            const contentStart = currentLinePos + contentStartInLine;
            const contentEnd = currentLinePos + line.trimEnd().length - 1;

            chunks.push({
                content,
                nickname: speaker,
                startPosition: contentStart,
                endPosition: contentEnd,
            });

        } else if (trimmedLine.length === 0) {
            // Empty line - paragraph break
            flushContent();

        } else {
            // Regular content line - accumulate
            if (contentLines.length === 0) {
                contentStartPos = currentLinePos;
            }
            contentLines.push(line);
        }

        // Advance line position (include the \n)
        currentLinePos += line.length + 1;
    }

    // Flush any remaining content
    flushContent();

    return chunks;
}

/**
 * Unzip QDPX file to a directory
 * Returns the path where files were extracted (the root of the archive contents)
 */
async function unzipQdpx(qdpxPath: string, extractDir: string): Promise<string> {
    const zip = new AdmZip(qdpxPath);
    zip.extractAllTo(extractDir, true);
    return extractDir;
}

/**
 * Parse REFI-QDA project XML file
 */
async function parseProjectXml(xmlPath: string): Promise<RefiProject> {
    const xmlContent = await readFile(xmlPath, "utf-8");
    const parsed = await parseStringPromise(xmlContent, {
        explicitArray: false,
        mergeAttrs: true,
    });

    // Navigate to Project node
    const project = parsed.Project || {};
    return project;
}

/**
 * Resolve internal:// path to actual file path in Sources directory
 */
function resolveInternalPath(internalPath: string, sourcesDir: string): string {
    // internal://xxx.txt -> Sources/xxx.txt
    const filename = internalPath.replace("internal://", "");
    return join(sourcesDir, filename);
}

/**
 * Extract nickname from source name
 */
function extractNickname(sourceName: string): string {
    // Remove file extension
    const nameWithoutExt = sourceName.replace(/\.(txt|docx|doc)$/i, "");

    // Try to extract a proper name (first word or quoted name)
    const match = nameWithoutExt.match(/^([A-Z][a-z]+)/);
    if (match) {
        return match[1];
    }

    return "Source";
}

/**
 * Flatten nested code structure into array with category ancestry
 *
 * @param codes - Array of potentially nested codes
 * @param parentCategories - Accumulated parent category names
 * @returns Flat array of codes with categories[] preserving hierarchy
 */
function flattenCodes(codes: RefiCode[], parentCategories: string[] = []): RefiCode[] {
    const result: RefiCode[] = [];

    for (const code of codes) {
        // Create flattened version with current ancestry
        const flatCode: RefiCode = {
            guid: code.guid,
            name: code.name,
            Description: code.Description,
            isCodable: code.isCodable,
            color: code.color,
        };

        // Store parent categories for this code
        if (parentCategories.length > 0) {
            // We'll attach categories as a custom property for later use
            (flatCode as any).__categories = [...parentCategories];
        }

        result.push(flatCode);

        // Recursively flatten children
        if (code.Code) {
            const children = Array.isArray(code.Code) ? code.Code : [code.Code];
            const childCategories = [...parentCategories, code.name];
            result.push(...flattenCodes(children, childCategories));
        }
    }

    return result;
}

/**
 * Filter codebook using bottom-up approach
 */
function filterCodebook(codes: RefiCode[]): RefiCode[] {
    // Build map for quick lookup
    const codeMap = new Map<string, RefiCode>();
    codes.forEach((code) => codeMap.set(code.guid, code));

    // Build children map using category relationships
    const childrenMap = new Map<string, Set<string>>();
    for (const code of codes) {
        const categories = (code as any).__categories as string[] | undefined;
        if (categories && categories.length > 0) {
            // This code has a parent - find the parent by name
            const parentName = categories[categories.length - 1];
            const parentCode = codes.find((c) => c.name === parentName);
            if (parentCode) {
                if (!childrenMap.has(parentCode.guid)) {
                    childrenMap.set(parentCode.guid, new Set());
                }
                childrenMap.get(parentCode.guid)!.add(code.guid);
            }
        }
    }

    // Bottom-up filtering
    function shouldKeep(code: RefiCode): boolean {
        const hasDescription = !!code.Description && code.Description.trim().length > 0;
        const hasChildren = childrenMap.has(code.guid);

        if (!hasDescription && !hasChildren) {
            return false;
        }

        if (!hasChildren) {
            // Leaf node with description
            return true;
        }

        // Has children - keep only if at least one child should be kept
        const children = childrenMap.get(code.guid)!;
        return Array.from(children).some((childGuid) => {
            const childCode = codeMap.get(childGuid);
            return childCode ? shouldKeep(childCode) : false;
        });
    }

    return codes.filter(shouldKeep);
}

/**
 * Convert REFI codebook to our Codebook format
 */
function convertCodebook(codes: RefiCode[]): Codebook {
    const filteredCodes = filterCodebook(codes);
    const codebook: Codebook = {};

    for (const refiCode of filteredCodes) {
        const label = refiCode.name;
        const categories = (refiCode as any).__categories as string[] | undefined;

        const code: Code = {
            label,
        };

        if (categories && categories.length > 0) {
            code.categories = categories;
        }

        if (refiCode.Description && refiCode.Description.trim().length > 0) {
            code.definitions = [refiCode.Description];
        }

        codebook[label] = code;
    }

    return codebook;
}

/**
 * Convert TextSource to RawDataChunk with final thread ID
 *
 * @param source - The REFI TextSource to convert
 * @param sourcesDir - Directory containing source text files
 * @param users - Map of user GUIDs to names
 * @param threadId - Final thread ID to use (e.g., "thread-1")
 * @param chunkContent - Optional content chunking function
 * @returns RawDataChunk with items using final IDs
 */
async function convertTextSource(
    source: RefiTextSource,
    sourcesDir: string,
    users: Map<string, string>,
    threadId: string,
    chunkContent: (content: string) => ChunkContentResult[] = defaultChunkContent,
): Promise<RawDataChunk> {
    // Read plaintext content
    let plaintext = source.plainTextContent;
    if (!plaintext && source.plainTextPath) {
        const textPath = resolveInternalPath(source.plainTextPath, sourcesDir);
        plaintext = await readFile(textPath, "utf-8");
    }

    if (!plaintext) {
        plaintext = "";
    }

    // Split into chunks using callback (default or custom)
    const chunks = chunkContent(plaintext);

    // Extract default nickname from source
    const defaultNickname = extractNickname(source.name);
    const defaultUid = users.get(source.creatingUser) || defaultNickname;

    // Create DataItems from chunks with final thread-based IDs
    const items: RawDataItem[] = chunks.map((chunk, index) => ({
        id: `${threadId}-${index + 1}`,
        uid: chunk.uid || chunk.nickname || defaultUid,
        nickname: chunk.nickname || defaultNickname,
        time: chunk.time || source.creationDateTime,
        content: chunk.content,
        startPosition: chunk.startPosition,
        endPosition: chunk.endPosition,
    }));

    // Create RawDataChunk with final thread ID
    return {
        id: threadId,
        start: source.creationDateTime,
        end: source.modifiedDateTime || source.creationDateTime,
        items,
    };
}

/**
 * Find paragraph items that overlap with a text selection
 *
 * Uses the startPosition and endPosition metadata fields to determine overlap.
 * This is more reliable than parsing IDs since IDs may have various formats.
 *
 * @param items - Array of data items with position metadata
 * @param startPos - Start position of the coded selection
 * @param endPos - End position of the coded selection
 * @returns Array of item IDs that overlap with the selection
 */
function findOverlappingItems(
    items: RawDataItem[],
    startPos: number,
    endPos: number,
): string[] {
    const overlapping: string[] = [];

    for (const item of items) {
        // Use position metadata fields directly
        const itemStart = item.startPosition;
        const itemEnd = item.endPosition;

        // Skip items without position metadata
        if (itemStart === undefined || itemEnd === undefined) {
            continue;
        }

        // Check for overlap: items overlap if NOT (selection ends before item OR selection starts after item)
        if (!(endPos < itemStart || startPos > itemEnd)) {
            overlapping.push(item.id);
        }
    }

    return overlapping;
}

/**
 * Extract coded threads per coder
 *
 * Since items already have final thread-based IDs, this function simply
 * maps codes to items without any renumbering.
 *
 * @param project - The REFI project structure
 * @param sourceChunks - Map of thread ID to RawDataChunk (already using final IDs)
 * @param codeGuidToName - Map of code GUIDs to code labels
 * @param users - Map of user GUIDs to names
 * @param codebook - The converted codebook
 * @returns Map of coder names to their coded threads
 */
function extractCodedThreads(
    project: RefiProject,
    sourceChunks: Map<string, RawDataChunk>,
    codeGuidToName: Map<string, string>,
    users: Map<string, string>,
    codebook: Codebook,
    sourceGuidToThreadId: Map<string, string>,
): Map<string, any> {
    const coderThreads = new Map<string, any>();

    const textSourceList = Array.isArray(project.Sources?.TextSource)
        ? project.Sources.TextSource
        : project.Sources?.TextSource
        ? [project.Sources.TextSource]
        : [];

    if (textSourceList.length === 0) {
        return coderThreads;
    }

    // Process each source
    for (const source of textSourceList) {
        if (!source.PlainTextSelection) {
            continue;
        }

        // Get the thread ID for this source
        const threadId = sourceGuidToThreadId.get(source.guid);
        if (!threadId) continue;

        const chunk = sourceChunks.get(threadId);
        if (!chunk) continue;

        // Normalize PlainTextSelection to array
        const selectionList = Array.isArray(source.PlainTextSelection)
            ? source.PlainTextSelection
            : [source.PlainTextSelection];

        // Process each selection
        for (const selection of selectionList) {
            if (!selection.Coding) {
                // Skip selections without coding (e.g., just annotations)
                continue;
            }

            const overlappingItems = findOverlappingItems(
                chunk.items as RawDataItem[],
                selection.startPosition,
                selection.endPosition,
            );

            if (overlappingItems.length === 0) continue;

            // Normalize Coding to array
            const codingList = Array.isArray(selection.Coding)
                ? selection.Coding
                : [selection.Coding];

            // Process each coding (each coding has its own coder)
            for (const coding of codingList) {
                const coderGuid = coding.creatingUser;
                const coderName = users.get(coderGuid) || "Unknown";
                const codeName = codeGuidToName.get(coding.CodeRef.targetGUID);

                // Skip if code doesn't exist or wasn't kept in the filtered codebook
                if (!codeName || !codebook[codeName]) continue;

                // Initialize coder data structure
                if (!coderThreads.has(coderName)) {
                    coderThreads.set(coderName, {
                        threads: {},
                    });
                }

                const coderData = coderThreads.get(coderName);
                if (!coderData.threads[threadId]) {
                    coderData.threads[threadId] = {
                        id: threadId,
                        codes: codebook,
                        items: {},
                        iteration: 0,
                    };
                }

                const thread = coderData.threads[threadId];

                // Add code to overlapping items (items already have final IDs)
                for (const itemId of overlappingItems) {
                    if (!thread.items[itemId]) {
                        thread.items[itemId] = {
                            id: itemId,
                            codes: [],
                        };
                    }
                    // Add code if not already present
                    if (!thread.items[itemId].codes.includes(codeName)) {
                        thread.items[itemId].codes.push(codeName);
                    }
                }
            }
        }
    }

    // Filter out threads with no coded items
    for (const [coderName, coderData] of coderThreads) {
        const threads = coderData.threads;
        const filteredThreads: Record<string, any> = {};

        for (const [threadId, thread] of Object.entries(threads)) {
            // Only keep threads that have at least one coded item
            if (Object.keys((thread as any).items).length > 0) {
                filteredThreads[threadId] = thread;
            }
        }

        // Update the coder's threads (or remove coder if no threads remain)
        if (Object.keys(filteredThreads).length > 0) {
            coderData.threads = filteredThreads;
        } else {
            coderThreads.delete(coderName);
        }
    }

    return coderThreads;
}

/**
 * Convert QDPX file to JSON dataset format
 *
 * @param qdpxPath - Path to .qdpx file
 * @param outputDir - Directory to write JSON files
 * @param chunkContent - Optional callback to split content into chunks (defaults to defaultChunkContent)
 */
export async function convertQdpxToJson(
    qdpxPath: string,
    outputDir: string,
    chunkContent?: (content: string) => ChunkContentResult[],
): Promise<void> {
    // Create output directory
    await mkdir(outputDir, { recursive: true });

    // Extract QDPX directly to output directory
    const extractDir = await unzipQdpx(qdpxPath, outputDir);

    // Parse project.qde XML file
    const projectFile = join(extractDir, "project.qde");
    const project = await parseProjectXml(projectFile);

    // Build user GUID -> name map
    const users = new Map<string, string>();
    const userList = Array.isArray(project.Users?.User)
        ? project.Users.User
        : project.Users?.User
        ? [project.Users.User]
        : [];

    for (const user of userList) {
        users.set(user.guid, user.name);
    }

    // Convert codebook
    const codeList = Array.isArray(project.CodeBook?.Codes?.Code)
        ? project.CodeBook.Codes.Code
        : project.CodeBook?.Codes?.Code
        ? [project.CodeBook.Codes.Code]
        : [];

    // Flatten nested code structure
    const flattenedCodes = flattenCodes(codeList);

    const codebook = convertCodebook(flattenedCodes);

    // Build code GUID -> label map (using flattened codes)
    const codeGuidToName = new Map<string, string>();
    for (const code of flattenedCodes) {
        codeGuidToName.set(code.guid, code.name);
    }

    // PHASE 1: Determine thread IDs upfront
    const textSourceList = Array.isArray(project.Sources?.TextSource)
        ? project.Sources.TextSource
        : project.Sources?.TextSource
        ? [project.Sources.TextSource]
        : [];

    // Create source GUID -> thread ID mapping
    const sourceGuidToThreadId = new Map<string, string>();
    let threadNum = 1;
    for (const source of textSourceList) {
        const threadId = `thread-${threadNum}`;
        sourceGuidToThreadId.set(source.guid, threadId);
        threadNum++;
    }

    // PHASE 2: Convert TextSources to RawDataChunks with final thread IDs
    const sourcesDir = join(extractDir, "Sources");
    const sources: Record<string, RawDataChunk> = {};
    const sourceChunks = new Map<string, RawDataChunk>();

    for (const source of textSourceList) {
        const threadId = sourceGuidToThreadId.get(source.guid)!;
        const chunk = await convertTextSource(source, sourcesDir, users, threadId, chunkContent);
        sources[threadId] = chunk;
        sourceChunks.set(threadId, chunk);
    }

    // PHASE 3: Extract coded threads per coder (no renumbering needed)
    const coderThreads = extractCodedThreads(
        project,
        sourceChunks,
        codeGuidToName,
        users,
        codebook,
        sourceGuidToThreadId,
    );

    // Write codebook.json
    await writeFile(
        join(outputDir, "codebook.json"),
        JSON.stringify(codebook, null, 4),
    );

    // Write sources.json (already using final thread IDs)
    await writeFile(
        join(outputDir, "sources.json"),
        JSON.stringify(sources, null, 4),
    );

    // Write configuration.js (preserve existing if it exists)
    const configPath = join(outputDir, "configuration.js");
    const datasetName = basename(qdpxPath, ".qdpx");

    if (!existsSync(configPath)) {
        // Create new configuration.js
        const configContent = `export default ${JSON.stringify(
            {
                name: datasetName,
                title: project.name || datasetName,
                description: "",
                researchQuestion: "",
                codingNotes: "",
                data: { sources: "sources.json" },
            },
            null,
            4,
        )};
`;
        await writeFile(configPath, configContent);
    }
    // If configuration.js exists, leave it untouched to preserve user modifications

    // Write human/*.json and *.xlsx files
    const humanDir = join(outputDir, "human");
    await mkdir(humanDir, { recursive: true });

    // Convert sources to array for Excel export
    const chunksArray = Object.values(sources);

    for (const [coderName, coderData] of coderThreads) {
        const baseName = coderName.replace(/[^a-zA-Z0-9]/g, "_");

        // Add unified codebook for Excel export
        coderData.codebook = codebook;

        // Write JSON file
        await writeFile(
            join(humanDir, `${baseName}.json`),
            JSON.stringify(coderData, null, 4),
        );

        // Write Excel file (use chunks with final IDs)
        const workbook = exportChunksForCoding(chunksArray as any, coderData);
        await workbook.xlsx.writeFile(join(humanDir, `${baseName}.xlsx`));
    }
}
