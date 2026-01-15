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
import { join, basename } from "path";
import { parseStringPromise } from "xml2js";
import AdmZip from "adm-zip";

import type { Code, Codebook, RawDataChunk, RawDataItem } from "../../schema.js";

/**
 * REFI-QDA Code structure
 */
interface RefiCode {
    guid: string;
    name: string;
    Description?: string;
    isCodable?: boolean;
    color?: string;
}

/**
 * REFI-QDA User structure
 */
interface RefiUser {
    guid: string;
    name: string;
}

/**
 * REFI-QDA Coding (applied code reference)
 */
interface RefiCoding {
    guid: string;
    creatingUser: string;
    creationDateTime: string;
    CodeRef: {
        targetGUID: string;
    };
}

/**
 * REFI-QDA PlainTextSelection (coded text segment)
 */
interface RefiPlainTextSelection {
    guid: string;
    name?: string;
    startPosition: number;
    endPosition: number;
    creatingUser: string;
    creationDateTime: string;
    Coding?: RefiCoding[];
}

/**
 * REFI-QDA TextSource structure
 */
interface RefiTextSource {
    guid: string;
    name: string;
    plainTextPath?: string;
    plainTextContent?: string;
    creatingUser: string;
    creationDateTime: string;
    modifyingUser?: string;
    modifiedDateTime?: string;
    PlainTextSelection?: RefiPlainTextSelection[];
}

/**
 * REFI-QDA Project structure
 */
interface RefiProject {
    name?: string;
    creationDateTime?: string;
    CodeBook?: {
        Codes?: {
            Code?: RefiCode[];
        };
    };
    Sources?: {
        TextSource?: RefiTextSource[];
    };
    Users?: {
        User?: RefiUser[];
    };
}


/**
 * Chunk content result with position tracking
 */
export type ChunkContentResult = Partial<RawDataItem> & {
    content: string;
    startPosition: number;
    endPosition: number;
};

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
 * Filter codebook using bottom-up approach
 */
function filterCodebook(codes: RefiCode[]): RefiCode[] {
    // Build map for quick lookup
    const codeMap = new Map<string, RefiCode>();
    codes.forEach((code) => codeMap.set(code.guid, code));

    // Build children map by parsing :: notation
    const childrenMap = new Map<string, Set<string>>();
    for (const code of codes) {
        const parts = code.name.split("::");
        if (parts.length > 1) {
            // This is a child code
            const parentName = parts.slice(0, -1).join("::");
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

        if (hasDescription) {
            return true;
        }

        if (!hasChildren) {
            return false;
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
        const parts = refiCode.name.split("::");
        const label = parts[parts.length - 1]; // Leaf name
        const categories = parts.length > 1 ? parts.slice(0, -1) : undefined;

        const code: Code = {
            label,
        };

        if (categories) {
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
 * Convert TextSource to RawDataChunk
 */
async function convertTextSource(
    source: RefiTextSource,
    sourcesDir: string,
    users: Map<string, string>,
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

    // Create DataItems from chunks
    const items: RawDataItem[] = chunks.map((chunk) => ({
        id: `${source.guid}-${chunk.startPosition}-${chunk.endPosition}`,
        uid: chunk.uid || defaultUid,
        nickname: chunk.nickname || defaultNickname,
        time: chunk.time || source.creationDateTime,
        content: chunk.content,
        startPosition: chunk.startPosition,
        endPosition: chunk.endPosition,
    }));

    // Create RawDataChunk
    return {
        id: source.guid,
        start: source.creationDateTime,
        end: source.modifiedDateTime || source.creationDateTime,
        items,
    };
}

/**
 * Find paragraph items that overlap with a text selection
 */
function findOverlappingItems(
    items: RawDataItem[],
    startPos: number,
    endPos: number,
): string[] {
    const overlapping: string[] = [];

    for (const item of items) {
        // Parse position from item ID: sourceGuid-startPos-endPos
        const parts = item.id.split("-");
        if (parts.length < 3) continue;

        const itemStart = parseInt(parts[parts.length - 2], 10);
        const itemEnd = parseInt(parts[parts.length - 1], 10);

        // Check for overlap
        if (!(endPos < itemStart || startPos > itemEnd)) {
            overlapping.push(item.id);
        }
    }

    return overlapping;
}

/**
 * Extract coded threads per coder
 */
function extractCodedThreads(
    project: RefiProject,
    sourceChunks: Map<string, RawDataChunk>,
    codeGuidToName: Map<string, string>,
    users: Map<string, string>,
    codebook: Codebook,
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

        const chunk = sourceChunks.get(source.guid);
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

                if (!codeName) continue;

                // Initialize coder data structure
                if (!coderThreads.has(coderName)) {
                    coderThreads.set(coderName, {
                        threads: {},
                    });
                }

                const coderData = coderThreads.get(coderName);
                if (!coderData.threads[source.guid]) {
                    coderData.threads[source.guid] = {
                        id: source.guid,
                        codes: codebook,
                        items: {},
                        iteration: 0,
                    };
                }

                const thread = coderData.threads[source.guid];

                // Add code to overlapping items
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

    const codebook = convertCodebook(codeList);

    // Build code GUID -> label map
    const codeGuidToName = new Map<string, string>();
    for (const code of codeList) {
        const parts = code.name.split("::");
        const label = parts[parts.length - 1];
        codeGuidToName.set(code.guid, label);
    }

    // Convert TextSources to RawDataChunks
    const sourcesDir = join(extractDir, "Sources");
    const sources: Record<string, RawDataChunk> = {};
    const sourceChunks = new Map<string, RawDataChunk>();

    const textSourceList = Array.isArray(project.Sources?.TextSource)
        ? project.Sources.TextSource
        : project.Sources?.TextSource
        ? [project.Sources.TextSource]
        : [];

    for (const source of textSourceList) {
        const chunk = await convertTextSource(source, sourcesDir, users, chunkContent);
        sources[source.guid] = chunk;
        sourceChunks.set(source.guid, chunk);
    }

    // Extract coded threads per coder
    const coderThreads = extractCodedThreads(
        project,
        sourceChunks,
        codeGuidToName,
        users,
        codebook,
    );

    // Write sources.json
    await writeFile(
        join(outputDir, "sources.json"),
        JSON.stringify(sources, null, 4),
    );

    // Write configuration.js
    const datasetName = basename(qdpxPath, ".qdpx");
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
    await writeFile(join(outputDir, "configuration.js"), configContent);

    // Write human/*.json files
    const humanDir = join(outputDir, "human");
    await mkdir(humanDir, { recursive: true });

    for (const [coderName, coderData] of coderThreads) {
        const fileName = `${coderName.replace(/[^a-zA-Z0-9]/g, "_")}.json`;
        await writeFile(
            join(humanDir, fileName),
            JSON.stringify(coderData, null, 4),
        );
    }
}
