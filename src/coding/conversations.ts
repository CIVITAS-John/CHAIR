/**
 * Core conversation analysis utilities and base classes.
 *
 * This file provides the foundation for all conversation-based qualitative coding analyzers.
 * It defines the base ConversationAnalyzer class and utility functions for building prompts
 * and formatting messages for LLM consumption.
 *
 * Key responsibilities:
 * - Define the abstract ConversationAnalyzer base class
 * - Provide message formatting utilities for LLM prompts
 * - Handle special message types (images, check-ins, emojis)
 * - Support both full and shortened speaker name formats
 * - Integrate preliminary coding tags when available
 *
 * @author John Chen
 */

import { Analyzer } from "../analyzer.js";
import type { CodedItem, CodedThread, Conversation, Dataset, Message } from "../schema.js";

/**
 * Abstract base class for all conversation-based analyzers.
 *
 * This class extends the generic Analyzer to specialize in analyzing conversations
 * where the data source is a Conversation, subunits are Messages, and the output
 * is a CodedThread containing codes and analysis metadata.
 *
 * Concrete implementations define specific coding strategies (item-level, chunk-level,
 * BERTopic-based, etc.) by implementing the required abstract methods from Analyzer.
 */
export abstract class ConversationAnalyzer extends Analyzer<Conversation, Message, CodedThread> {}

/**
 * Build a formatted prompt segment for a single message.
 *
 * This utility function converts a message into a standardized format suitable for
 * inclusion in LLM prompts. It handles speaker identification, message content,
 * user mentions, special content types, and preliminary codes.
 *
 * Format: "{Speaker Name}: {Message Content}\nPreliminary {tagsName}: {codes}"
 *
 * Special handling:
 * - Converts user mentions @User(123) to @Speaker Name format
 * - Adds unique IDs to special content markers [Image], [Checkin], [Emoji]
 * - Includes preliminary coding tags if available from previous analysis rounds
 * - Supports shortened speaker names for examples (e.g., "User" instead of "User-123")
 *
 * @param dataset - The dataset containing speaker name mappings
 * @param message - The message to format
 * @param coded - Optional preliminary coding results to include
 * @param tagsName - Name for the tag type in prompts (default: "tags")
 * @param shortenName - Whether to use shortened speaker names (default: false)
 * @returns Formatted message string for LLM prompt, or empty string if content is non-string
 */
export const buildMessagePrompt = (
    dataset: Dataset<unknown>,
    message: Message,
    coded?: CodedItem,
    tagsName = "tags",
    shortenName = false,
) => {
    if (typeof message.content !== "string") {
        return "";
    }

    // Replace user mentions with human-readable speaker names
    // Converts @Something(123) to @Speaker Name
    let content = message.content.replaceAll(/@.*?\((\d+)\)(?:\W|$)/g, (_, id: string) => {
        return `@${shortenName ? dataset.getSpeakerNameForExample(id) : dataset.getSpeakerName(id)} `;
    });

    // Add unique message IDs to special content markers to prevent LLM confusion
    // Converts [Image] to [Image 42] where 42 is the message ID
    content = content.replace(
        /\[(Image|Checkin|Emoji)\]/g,
        (_Match, Type) => `[${Type} ${message.id}]`,
    );

    // Compose the final result with speaker prefix
    let result = `${shortenName ? dataset.getSpeakerNameForExample(message.uid) : dataset.getSpeakerName(message.uid)}: ${content}`;

    // Append preliminary codes if available from previous coding rounds
    if (coded?.codes?.length) {
        result += `\nPreliminary ${tagsName}: ${coded.codes.join("; ")}`;
    }

    return result;
};

/**
 * Revert a message format from LLM output back to canonical form.
 *
 * This function reverses the ID-appending transformation applied by buildMessagePrompt.
 * It's used when parsing LLM responses that may quote message content with modified
 * special markers.
 *
 * Converts: [Image 42] -> [Image]
 * Converts: [Checkin 123] -> [Checkin]
 * Converts: [Emoji 456] -> [Emoji]
 *
 * @param message - The message string to revert
 * @returns Message with special markers restored to canonical form
 */
export const revertMessageFormat = (message: string) =>
    message.replaceAll(/\[(Image|Checkin|Emoji) [^\]]+\]/g, "[$1]");
