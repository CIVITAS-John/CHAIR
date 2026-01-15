/**
 * Type definitions for REFI-QDA QDPX file format
 *
 * REFI-QDA is a standard for exchanging qualitative data between different analysis tools.
 * QDPX files are zip archives containing:
 * - project.qde: XML file with project metadata, codebook, sources, and coded segments
 * - Sources/: Directory with plain text files
 */

import type { RawDataItem } from "../../schema.js";

/**
 * REFI-QDA Code structure (supports nested hierarchy)
 */
export interface RefiCode {
    guid: string;
    name: string;
    Description?: string;
    isCodable?: boolean;
    color?: string;
    Code?: RefiCode[]; // Nested sub-codes
}

/**
 * REFI-QDA User structure
 */
export interface RefiUser {
    guid: string;
    name: string;
}

/**
 * REFI-QDA Coding (applied code reference)
 */
export interface RefiCoding {
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
export interface RefiPlainTextSelection {
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
export interface RefiTextSource {
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
export interface RefiProject {
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
