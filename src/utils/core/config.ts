/**
 * Configuration Management
 *
 * This module provides centralized configuration loading for LLM models and embedders.
 * Supports:
 * - Loading from config.json file
 * - Model aliasing (string references to other configs)
 * - Runtime overrides for pipeline-specific configurations
 * - Environment variable integration
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * Configuration object for an LLM model
 *
 * @property provider - LLM provider identifier
 * @property name - Model name/identifier used by the provider
 * @property contextWindow - Optional max total tokens (input + output)
 * @property batchSize - Maximum number of items to process in a batch (default: 32)
 * @property options - Provider-specific options and settings
 */
export interface ModelConfig {
    provider: "openai" | "anthropic" | "google" | "openrouter" | "openai-compatible";
    name: string;
    contextWindow?: number;
    batchSize?: number;
    options?: {
        temperature?: number;
        reasoningEffort?: "low" | "medium" | "high";
        concurrencyLimit?: number;
        baseURL?: string;
        apiKey?: string;
        [key: string]: unknown;
    };
}

/**
 * Configuration object for an embedding model
 *
 * @property provider - Embedding provider identifier
 * @property name - Model name/identifier used by the provider
 * @property dimensions - Dimensionality of the embedding vectors
 * @property batchSize - Maximum number of texts to embed in a single request (default: 50)
 * @property prompt - Optional prompt template to wrap input text (use {input} placeholder)
 * @property options - Provider-specific options and settings
 */
export interface EmbedderConfig {
    provider: "openai" | "google" | "openai-compatible";
    name: string;
    dimensions: number;
    batchSize?: number;
    prompt?: string;
    options?: {
        concurrencyLimit?: number;
        baseURL?: string;
        apiKey?: string;
        [key: string]: unknown;
    };
}

/**
 * Root configuration structure
 *
 * @property llms - Map of LLM configurations (string values are aliases)
 * @property embedders - Map of embedder configurations (string values are aliases)
 */
export interface Config {
    llms: Record<string, ModelConfig | string>;
    embedders: Record<string, EmbedderConfig | string>;
}

let cachedConfig: Config | null = null;

/**
 * Load configuration from config.json file
 *
 * Loads from the root config.json file. Caches the result for subsequent calls.
 *
 * @param configPath - Optional path to config file (defaults to ./config.json)
 * @returns Parsed configuration object
 * @throws {Error} If config.json doesn't exist or is invalid JSON
 */
export const loadConfig = (configPath?: string): Config => {
    if (cachedConfig) {
        return cachedConfig;
    }

    const path = configPath ?? resolve(process.cwd(), "config.json");

    if (!existsSync(path)) {
        throw new Error(`Configuration file not found: ${path}`);
    }

    try {
        const content = readFileSync(path, "utf-8");
        cachedConfig = JSON.parse(content) as Config;
        return cachedConfig;
    } catch (error) {
        throw new Error(
            `Failed to parse configuration file: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
    }
};

/**
 * Get a model configuration by name with optional overrides
 *
 * Supports:
 * - Alias resolution (string values that reference other configs)
 * - Runtime overrides for pipeline-specific configurations
 * - Fallback to "default" model if name not found
 *
 * @param name - Name of the model configuration
 * @param overrides - Optional configuration overrides to merge/replace global config
 * @returns Resolved model configuration object
 * @throws {Error} If model not found and no default is configured
 *
 * @example
 * // Get model by name
 * const config = getModelConfig("gpt-4o");
 *
 * @example
 * // Use alias
 * const config = getModelConfig("default");  // Resolves to actual model config
 *
 * @example
 * // With overrides
 * const config = getModelConfig("custom", {
 *   custom: { provider: "openai", name: "gpt-4o", batchSize: 16 }
 * });
 */
export const getModelConfig = (
    name: string = "default",
    overrides?: Record<string, ModelConfig | string>,
): ModelConfig => {
    // Check overrides first
    if (overrides && overrides[name]) {
        const override = overrides[name];
        if (typeof override === "string") {
            // It's an alias, resolve it
            return getModelConfig(override, overrides);
        }
        // It's a direct config
        return override;
    }

    // Fall back to global config
    const config = loadConfig();
    const modelConfig = config.llms[name];

    if (!modelConfig) {
        // Try falling back to default
        if (name === "default") {
            throw new Error(
                'The assignment for "default" is not found in config.json. Please check your configuration!',
            );
        }
        return getModelConfig("default", overrides);
    }

    if (typeof modelConfig === "string") {
        // It's an alias, resolve it
        return getModelConfig(modelConfig, overrides);
    }

    return modelConfig;
};

/**
 * Get an embedder configuration by name with optional overrides
 *
 * Supports:
 * - Alias resolution (string values that reference other configs)
 * - Runtime overrides for pipeline-specific configurations
 * - Fallback to "default" embedder if name not found
 *
 * @param name - Name of the embedder configuration
 * @param overrides - Optional configuration overrides to merge/replace global config
 * @returns Resolved embedder configuration object
 * @throws {Error} If embedder not found and no default is configured
 *
 * @example
 * // Get embedder by name
 * const config = getEmbedderConfig("openai-small-512");
 *
 * @example
 * // With overrides
 * const config = getEmbedderConfig("custom", {
 *   custom: { provider: "openai", name: "text-embedding-3-small", dimensions: 512 }
 * });
 */
export const getEmbedderConfig = (
    name: string = "default",
    overrides?: Record<string, EmbedderConfig | string>,
): EmbedderConfig => {
    // Check overrides first
    if (overrides && overrides[name]) {
        const override = overrides[name];
        if (typeof override === "string") {
            // It's an alias, resolve it
            return getEmbedderConfig(override, overrides);
        }
        // It's a direct config
        return override;
    }

    // Fall back to global config
    const config = loadConfig();
    const embedderConfig = config.embedders[name];

    if (!embedderConfig) {
        // Try falling back to default
        if (name === "default") {
            throw new Error(
                'The assignment for "default" is not found in config.json. Please check your configuration!',
            );
        }
        return getEmbedderConfig("default", overrides);
    }

    if (typeof embedderConfig === "string") {
        // It's an alias, resolve it
        return getEmbedderConfig(embedderConfig, overrides);
    }

    return embedderConfig;
};
