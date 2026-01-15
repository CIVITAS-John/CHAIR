/**
 * Represents a single data item in a dataset (e.g., a message, comment, or post).
 * This is the atomic unit of analysis in the qualitative coding process.
 */
export interface DataItem {
    /** Unique identifier for this item */
    id: string;
    /** User ID of the item's sender/author */
    uid: string;
    /** Display name of the sender */
    nickname: string;
    /** Timestamp when the item was created */
    time: Date;
    /** The actual text/content of the item */
    content: string;
    /** Optional chunk ID for grouping related items */
    chunk?: string;
    /** User IDs mentioned in this item */
    mentions?: string[];
    /** Additional qualitative tags applied to this item */
    tags?: string[];
}

/**
 * JSON-serializable version of DataItem with time as string instead of Date
 */
export interface RawDataItem extends DataItem {
    time: string;
    /** Optional start position in source text for coded segment matching */
    startPosition?: number;
    /** Optional end position in source text for coded segment matching */
    endPosition?: number;
}

/**
 * Groups related data items together for analysis.
 * Chunks can contain items or nested chunks for hierarchical organization.
 * @template T - Type of data items contained in the chunk
 */
export interface DataChunk<T extends DataItem> {
    /** Unique identifier for this chunk */
    id: string;
    /** Start timestamp of the chunk's time range */
    start: Date;
    /** End timestamp of the chunk's time range */
    end: Date;
    /** Array of items or sub-chunks contained in this chunk */
    items: (T | DataChunk<T>)[];
    /** Aggregated list of all user IDs mentioned in this chunk */
    mentions?: string[];
}

/** An unloaded JSON representation of a data chunk. */
export interface RawDataChunk extends DataChunk<RawDataItem> {
    start: string;
    end: string;
    items: (RawDataItem | RawDataChunk)[];
}

/**
 * Complete dataset structure for qualitative analysis.
 * Contains metadata, research context, and the actual data chunks.
 * @template T - Type of data chunks in the dataset
 */
export interface Dataset<T extends DataChunk> {
    /** File system path to the dataset */
    path: string;
    /** Filesystem-safe identifier for the dataset */
    name: string;
    /** Human-readable title for the dataset */
    title: string;
    /** Detailed description of what this dataset contains */
    description: string;
    /** The main research question being investigated */
    researchQuestion: string;
    /** Additional notes/guidelines for coding this dataset */
    codingNotes: string;
    /** Nested structure of data chunks organized by category and ID */
    data: Record<string, Record<string, T>>;
    /** Maps user ID to their display name */
    getSpeakerName: (uid: string) => string;
    /** Maps user ID to anonymized name for examples */
    getSpeakerNameForExample: (uid: string) => string;
}

/** An unloaded JSON representation of a dataset. */
export interface RawDataset extends Omit<Dataset<RawDataChunk>, "path"> {
    data: Record<string, string>;
    getSpeakerName?: (uid: string) => string;
    getSpeakerNameForExample?: (uid: string) => string;
}

/**
 * Represents a qualitative code used for categorizing data.
 * Codes are the fundamental units of meaning in qualitative analysis.
 */
export interface Code {
    /** Primary label/name for this code */
    label: string;
    /** Higher-level categories this code belongs to */
    categories?: string[];
    /** Clear definitions explaining what this code represents */
    definitions?: string[];
    /** Example text snippets that exemplify this code */
    examples?: string[];
    /** Other names/labels that could refer to the same concept */
    alternatives?: string[];
    /** Previous labels used during consolidation (temporary) */
    oldLabels?: string[];
    /** IDs of codebooks containing this code (evaluation only) */
    owners?: number[];
    /** X,Y coordinates for visualization (evaluation only) */
    position?: [number, number];
}

/**
 * Collection of codes forming a complete coding scheme.
 * Maps code labels to their full definitions.
 */
export type Codebook = Record<string, Code>;

/**
 * Represents a single coded data item with associated qualitative codes.
 * This is the result of applying codes to individual data items.
 */
export interface CodedItem {
    /** Unique identifier matching the original data item */
    id: string;
    /** Array of code labels applied to this item */
    codes?: string[];
}

/**
 * Represents a complete coded thread/conversation with metadata.
 * Contains all coded items plus analysis context and summary information.
 */
export interface CodedThread {
    /** Unique identifier for the thread */
    id: string;
    /** High-level summary of the thread content */
    summary?: string;
    /** Initial analysis plan before coding began */
    plan?: string;
    /** Post-coding reflections and insights */
    reflection?: string;
    /** Complete codebook used for this thread */
    codes: Codebook;
    /** Map of item IDs to their coded results */
    items: Record<string, CodedItem>;
    /** Which coding iteration this represents */
    iteration: number;
}

/**
 * Container for multiple coded threads/conversations.
 * Optionally includes a unified codebook across all threads.
 */
export interface CodedThreads {
    /** Map of thread IDs to their coded analysis */
    threads: Record<string, CodedThread>;
    /** Optional unified codebook derived from all threads */
    codebook?: Codebook;
}

/**
 * Coded threads that guarantee a unified codebook exists.
 * Used after consolidation when a codebook is required.
 */
export interface CodedThreadsWithCodebook extends CodedThreads {
    /** Required unified codebook for all threads */
    codebook: Codebook;
}

/**
 * Specialized data item for chat messages.
 * Extends DataItem with chat-specific metadata.
 */
export interface Message extends DataItem {
    /** True if this is the sender's first message in the group */
    firstSeen?: boolean;
}

/**
 * Represents a conversation segment within a larger chat.
 * Tracks participants and temporal boundaries.
 */
export interface Conversation extends DataChunk<Message> {
    /** When this conversation segment began */
    start: Date;
    /** When this conversation segment ended */
    end: Date;
    /** Map of participant IDs to their message counts */
    participants: Map<string, number>;
    /** Count of new participants in this segment */
    firstSeen: number;
}

/**
 * Structure for comparing multiple codebooks from different coders.
 * Used to analyze inter-coder reliability and merge coding schemes.
 * @template T - Type of data chunks being analyzed
 */
export interface CodebookComparison<T extends DataChunk<DataItem>> {
    /** Display title for this comparison analysis */
    title: string;
    /** Original dataset that was coded */
    source: Dataset<T>;
    /** Array of codebooks from different coders to compare */
    codebooks: Codebook[];
    /** Human-readable names for each codebook */
    names: string[];
    /** Hierarchical grouping of related codebooks */
    groups?: number[][];
    /** Relative importance weights for each codebook */
    weights?: number[];
    /** Merged/unified codes from all codebooks */
    codes: Code[];
    /** Sum of all codebook weights */
    totalWeight?: number;
    /** Maps user IDs to display names for reports */
    uidToNicknames?: Map<string, string>;
    /** Pairwise distance matrix between codes for similarity analysis */
    distances: number[][];
    /** Additional configuration overrides */
    parameters?: Record<string, unknown>;
}

/**
 * Numeric evaluation metrics for codebook quality.
 * Maps metric names to their calculated values.
 */
export type CodebookEvaluation = Record<string, number>;

/**
 * Topic modeling results from BERTopic algorithm.
 * Maps topic IDs (numbers) to their document assignments and representative keywords.
 * Each topic contains the IDs of assigned documents, their probability scores, and
 * the most relevant keywords that characterize the topic.
 */
export type BertopicTopics = Record<
    number,
    {
        /** Document IDs assigned to this topic */
        ids: number[];
        /** Probability scores for each document assignment (aligned with ids array) */
        probabilities: number[];
        /** Top keywords representing this topic, ranked by relevance */
        keywords: string[];
    }
>;
