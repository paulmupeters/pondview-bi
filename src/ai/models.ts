/**
 * Centralized AI model configuration
 *
 * This file contains all AI model identifiers used throughout the application.
 * Update these constants to change models globally.
 */

/**
 * Model used for main chat streaming with complex reasoning
 */
export const CHAT_MODEL = "xai/grok-4.1-fast-reasoning";

/**
 * Model used for generating chart and card configurations
 * (lightweight tasks requiring structured output)
 */
export const VISUALIZATION_MODEL = "xai/grok-code-fast-1";

/**
 * Legacy chat model (used in backward compatibility route)
 */
export const LEGACY_CHAT_MODEL = "openai/gpt-5-nano";
