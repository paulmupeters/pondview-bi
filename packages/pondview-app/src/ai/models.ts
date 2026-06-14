/**
 * Centralized AI model configuration
 *
 * This file contains all AI model identifiers used throughout the application.
 * Update these constants to change models globally.
 */

/**
 * Model used for main chat streaming with complex reasoning
 */
export const CHAT_MODEL = "gpt-5.4";

/**
 * Model used for generating chart and card configurations
 * (lightweight tasks requiring structured output)
 */
export const VISUALIZATION_MODEL = "google/gemini-3-flash";
