/**
 * OpenRouter Utility with Fallback Models and Retry Logic
 *
 * This module provides a robust interface to OpenRouter API with:
 * - Multiple fallback models for reliability
 * - Automatic retry logic with exponential backoff
 * - Pre-request validation to ensure availability before payment settlement
 * - Error handling and detailed logging
 */

import { OpenRouter } from "@openrouter/sdk";

/**
 * Per-model fallback configuration for audit endpoints
 * Each model has 3 fallback models (downgrades/cheaper alternatives)
 *
 * Three primary audit models:
 * 1. DeepSeek V4.1 Flash - Fast and cost-effective
 * 2. Claude Sonnet 5.5 - High quality
 * 3. Claude Fable 5.1 - Premium quality
 */
export const MODEL_FALLBACK_CONFIG = {
  // DeepSeek V4.1 Flash fallbacks (downgrades to cheaper/faster models)
  "deepseek/deepseek-v4.1-flash": {
    fallbacks: [
      "z-ai/glm-5.3-flashx",                  // GLM 5.3 Flash
      "xiaomi/mimo-v2.6-flash",               // MiMo V2.6 Flash
      "~deepseek/deepseek-v4-flash-latest"    // DeepSeek V4 Flash Latest (downgrade)
    ],
    description: "DeepSeek V4.1 Flash",
    maxRetries: 2,
    timeout: 120000  // 120 seconds (2 minutes) for large audit prompts
  },

  // Claude Sonnet 5.5 fallbacks (downgrades to cheaper models)
  "anthropic/claude-sonnet-5.5": {
    fallbacks: [
      "openai/gpt-6-sol",              // GPT-6 Sol
      "~openai/gpt-terra-latest",      // GPT-6 Terra
      "google/gemini-pro"              // Gemini Pro Latest
    ],
    description: "Claude Sonnet 5.5",
    maxRetries: 2,
    timeout: 90000  // 90 seconds for large audit prompts
  },

  // Claude Fable 5.1 fallbacks (downgrades to cheaper models)
  "anthropic/claude-fable-5.1": {
    fallbacks: [
      "openai/gpt-6-astra",            // GPT-6 Astra
      "openai/gpt-6-astra-pro",        // GPT-6 Astra Pro
      "anthropic/claude-fable-5"       // Claude Fable 5 (downgrade)
    ],
    description: "Claude Fable 5.1",
    maxRetries: 2,
    timeout: 90000  // 90 seconds for large audit prompts
  }
} as const;

/**
 * Get all models to try (primary + fallbacks) for a specific model
 * @param primaryModel - The primary model identifier
 * @returns Array with primary model followed by its fallbacks
 */
function getModelsToTry(primaryModel: string): string[] {
  const config = MODEL_FALLBACK_CONFIG[primaryModel as keyof typeof MODEL_FALLBACK_CONFIG];
  if (config) {
    return [primaryModel, ...config.fallbacks];
  }
  // If model not in config, return only the primary model
  return [primaryModel];
}

export interface OpenRouterCallOptions {
  systemMessage: string;
  userMessage: string;
  maxTokens?: number;
  temperature?: number;
  responseFormat?:
    | { type: "json_object" | "text" }
    | { type: "json_schema"; jsonSchema: JsonSchemaDefinition };
  primaryModel: string; // Primary model to use (will use its configured fallbacks)
  skipValidation?: boolean; // Skip pre-request validation (for testing)
}

/**
 * JSON Schema definition for structured outputs
 * Used with OpenRouter's json_schema response format
 */
export interface JsonSchemaDefinition {
  name: string;
  strict: boolean;
  schema: {
    type: "object";
    properties: Record<string, any>;
    required: string[];
    additionalProperties: boolean;
  };
}

export interface OpenRouterResponse {
  success: boolean;
  content: string;
  model: string;
  tokensUsed: number;
  error?: string;
  attemptedModels?: string[];
  finishReason?: string;  // "end_turn" = complete, "length" = truncated, "stop" = stop sequence
}

/**
 * Exponential backoff delay calculation
 */
function calculateBackoffDelay(attempt: number, baseDelay: number = 1000): number {
  return Math.min(baseDelay * Math.pow(2, attempt), 10000); // Max 10 seconds
}

/**
 * Validate OpenRouter API key is configured
 */
function validateApiKey(): void {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY environment variable is not configured");
  }
}

/**
 * Test OpenRouter API availability with a lightweight request
 * This should be called BEFORE payment settlement to ensure service is available
 * @param modelId - Specific OpenRouter model ID to test (e.g., "anthropic/claude-sonnet-5.5")
 */
export async function testOpenRouterAvailability(modelId: string): Promise<boolean> {
  try {
    validateApiKey();

    const openrouter = new OpenRouter({
      apiKey: process.env.OPENROUTER_API_KEY!
    });

    console.log(`🔍 Testing OpenRouter API availability for model: ${modelId}...`);

    await Promise.race([
      openrouter.chat.send({
        chatRequest: {
          model: modelId,
          messages: [
            {
              role: "user",
              content: "ping"
            }
          ],
          maxTokens: 10,
          temperature: 0,
        }
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("OpenRouter availability test timeout")), 5000)
      )
    ]);

    console.log(`✅ OpenRouter API is available for model: ${modelId}`);
    return true;
  } catch (error: any) {
    console.error(`❌ OpenRouter API availability test failed for model ${modelId}:`, error.message);
    return false;
  }
}

/**
 * Call OpenRouter API with automatic fallback and retry logic
 *
 * This function will:
 * 1. Try each model in the fallback list
 * 2. Retry each model according to its maxRetries configuration
 * 3. Use exponential backoff between retries
 * 4. Return detailed error information if all attempts fail
 */
export async function callOpenRouterWithFallback(
  options: OpenRouterCallOptions
): Promise<OpenRouterResponse> {
  validateApiKey();

  const {
    systemMessage,
    userMessage,
    maxTokens = 32768,
    temperature = 0.7,
    responseFormat,
    primaryModel,
    skipValidation = false,
  } = options;

  // Get models to try (primary + its fallbacks)
  const modelsToTry = getModelsToTry(primaryModel);
  const attemptedModels: string[] = [];

  // Pre-request validation (unless skipped)
  if (!skipValidation) {
    const isAvailable = await testOpenRouterAvailability(primaryModel);
    if (!isAvailable) {
      return {
        success: false,
        content: "",
        model: "",
        tokensUsed: 0,
        error: "OpenRouter API is not available. Please try again later.",
        attemptedModels,
      };
    }
  }

  const openrouter = new OpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY!
  });

  // Try each model in the fallback list
  for (let modelIndex = 0; modelIndex < modelsToTry.length; modelIndex++) {
    const currentModel = modelsToTry[modelIndex]!;

    // Look up model config (use defaults if not found)
    const perModelConfig = MODEL_FALLBACK_CONFIG[currentModel as keyof typeof MODEL_FALLBACK_CONFIG];
    const modelConfig = perModelConfig || {
      description: "Model",
      maxRetries: 2,
      timeout: 45000,
    };

    console.log(`🤖 Attempting with model: ${currentModel} (${modelConfig.description})`);
    attemptedModels.push(currentModel);

    // Retry logic for current model
    for (let retryCount = 0; retryCount <= modelConfig.maxRetries; retryCount++) {
      try {
        if (retryCount > 0) {
          const delay = calculateBackoffDelay(retryCount - 1);
          console.log(`   ⏳ Retry ${retryCount}/${modelConfig.maxRetries} after ${delay}ms delay...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        // Build response format parameter based on type
        let openRouterResponseFormat: any = undefined;
        if (responseFormat) {
          if (responseFormat.type === "json_schema") {
            // Use OpenRouter's json_schema format with strict mode
            openRouterResponseFormat = {
              type: "json_schema",
              json_schema: responseFormat.jsonSchema
            };
          } else {
            // Use basic json_object or text format
            openRouterResponseFormat = { type: responseFormat.type };
          }
        }

        // Make the API call with timeout
        const result = await Promise.race([
          openrouter.chat.send({
            chatRequest: {
              model: currentModel,
              messages: [
                {
                  role: "system",
                  content: systemMessage
                },
                {
                  role: "user",
                  content: userMessage
                }
              ],
              maxTokens,
              temperature,
              stream: false,
              ...(openRouterResponseFormat && { responseFormat: openRouterResponseFormat }),
            }
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Request timeout")), modelConfig.timeout)
          )
        ]) as any;

        // Extract response
        const content = result.choices?.[0]?.message?.content || "";
        const finishReason = result.choices?.[0]?.finish_reason || "";

        // Try multiple paths for token usage (different SDK versions/models may use different formats)
        const tokensUsed =
          result.usage?.total_tokens ||
          result.usage?.totalTokens ||
          result.totalTokens ||
          (result.usage?.prompt_tokens || 0) + (result.usage?.completion_tokens || 0) ||
          0;

        if (!content) {
          throw new Error("Empty response from OpenRouter");
        }

        // CRITICAL: Check if response was truncated
        // finish_reason values:
        // - "end_turn" or "stop" = Complete response ✅
        // - "length" = Truncated due to max_tokens limit ❌
        // - "content_filter" = Filtered by content policy ❌
        if (finishReason === "length") {
          console.error(`❌ Response truncated - finish_reason: "length"`);
          console.error(`   Model: ${currentModel}`);
          console.error(`   Tokens used: ${tokensUsed}`);
          console.error(`   Content length: ${content.length} chars`);
          console.error(`   This typically means:`);
          console.error(`   1. max_tokens is too low for the request`);
          console.error(`   2. Input + thinking tokens + output exceeds limit`);
          console.error(`   3. For Claude: thinking tokens count against max_tokens`);

          throw new Error(
            `Response truncated (finish_reason: "length"). ` +
            `The model hit the max_tokens limit before completing the response. ` +
            `Used ${tokensUsed} tokens. Content may be incomplete or malformed JSON. ` +
            `Try: (1) Reduce input size, (2) Increase max_tokens, or (3) Use a different model.`
          );
        }

        // Log finish_reason for debugging
        console.log(`✅ Success with ${currentModel} (${tokensUsed} tokens, finish_reason: "${finishReason}")`);

        return {
          success: true,
          content,
          model: currentModel,
          tokensUsed,
          attemptedModels,
          finishReason,
        };

      } catch (error: any) {
        const errorMsg = error.message || "Unknown error";
        console.error(`   ❌ Attempt failed: ${errorMsg}`);

        // If this was the last retry for the last model, return error
        if (modelIndex === modelsToTry.length - 1 && retryCount === modelConfig.maxRetries) {
          return {
            success: false,
            content: "",
            model: "",
            tokensUsed: 0,
            error: `All models failed. Last error: ${errorMsg}`,
            attemptedModels,
          };
        }

        // If this was the last retry for this model, try next model
        if (retryCount === modelConfig.maxRetries) {
          console.log(`   ⚠️  Model ${currentModel} exhausted, trying next fallback...`);
          break;
        }

        // Otherwise, retry with same model
      }
    }
  }

  // This should never be reached, but just in case
  return {
    success: false,
    content: "",
    model: "",
    tokensUsed: 0,
    error: "All fallback models failed",
    attemptedModels,
  };
}

/**
 * Model name mapping for user-friendly model selection
 * Maps simple model names to full OpenRouter model identifiers
 *
 * Three primary audit models supported:
 * - DeepSeek: Fast and cost-effective (0.05 USDC checklist, 0.15 USDC audit)
 * - Sonnet: High quality (0.15 USDC checklist, 0.25 USDC audit)
 * - Fable: Premium quality (0.30 USDC checklist, 0.70 USDC audit)
 */
export const MODEL_MAPPINGS = {
  DeepSeek: "deepseek/deepseek-v4.1-flash",
  Sonnet: "anthropic/claude-sonnet-5.5",
  Fable: "anthropic/claude-fable-5.1",
} as const;

export type ModelName = keyof typeof MODEL_MAPPINGS;

/**
 * Convert user-friendly model name to OpenRouter model identifier
 * @param modelName - User-friendly model name (e.g., DeepSeek, Sonnet, GPT6Sol)
 * @returns OpenRouter model identifier
 * @throws Error if model name is not valid
 */
export function mapModelName(modelName: string): string {
  if (!(modelName in MODEL_MAPPINGS)) {
    throw new Error(
      `Invalid model name: ${modelName}. Must be one of: ${Object.keys(MODEL_MAPPINGS).join(", ")}`
    );
  }
  return MODEL_MAPPINGS[modelName as ModelName];
}

/**
 * Convenience function for JSON responses
 *
 * @deprecated Use Instructor library (callInstructorWithFallback) for structured outputs with validation
 */
export async function callOpenRouterJSON<T = any>(
  options: Omit<OpenRouterCallOptions, "responseFormat">
): Promise<OpenRouterResponse & { parsed?: T }> {
  const result = await callOpenRouterWithFallback({
    ...options,
    responseFormat: { type: "json_object" },
  });

  if (result.success) {
    try {
      const parsed = JSON.parse(result.content) as T;
      return { ...result, parsed };
    } catch (error) {
      // Log detailed parsing error for debugging
      console.error("❌ JSON Parse Error Details:");
      console.error(`   Content length: ${result.content.length} chars`);
      console.error(`   Content preview (first 250 chars): ${result.content.substring(0, 250)}`);
      console.error(`   Content preview (last 250 chars): ${result.content.substring(Math.max(0, result.content.length - 250))}`);
      console.error(`   Parse error: ${error instanceof Error ? error.message : String(error)}`);

      // Attempt to repair truncated JSON by closing unclosed arrays/objects
      let repairedContent = result.content.trim();

      // Count opening and closing brackets/braces
      const openBraces = (repairedContent.match(/\{/g) || []).length;
      const closeBraces = (repairedContent.match(/\}/g) || []).length;
      const openBrackets = (repairedContent.match(/\[/g) || []).length;
      const closeBrackets = (repairedContent.match(/\]/g) || []).length;

      // If truncated mid-JSON, try to close it
      if (openBraces > closeBraces || openBrackets > closeBrackets) {
        console.log(`   Attempting to repair truncated JSON (missing ${openBrackets - closeBrackets} ] and ${openBraces - closeBraces} })`);

        // Close arrays first, then objects
        for (let i = 0; i < (openBrackets - closeBrackets); i++) {
          repairedContent += ']';
        }
        for (let i = 0; i < (openBraces - closeBraces); i++) {
          repairedContent += '}';
        }

        try {
          const repairedParsed = JSON.parse(repairedContent) as T;
          console.log(`   ✅ Successfully repaired truncated JSON`);
          return { ...result, parsed: repairedParsed, content: repairedContent };
        } catch (repairError) {
          console.error(`   ❌ JSON repair failed: ${repairError instanceof Error ? repairError.message : String(repairError)}`);
        }
      }

      return {
        ...result,
        success: false,
        error: `Failed to parse JSON response (length: ${result.content.length} chars, likely truncated or malformed). Attempted repair failed.`,
      };
    }
  }

  return result;
}
