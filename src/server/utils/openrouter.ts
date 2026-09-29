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
 * Configuration for OpenRouter fallback models
 * Models are tried in order until one succeeds
 *
 * Priority order:
 * 1. openrouter/auto-beta - Smart routing to best available model
 * 2. anthropic/claude-3.5-sonnet - High quality, reliable
 * 3. openai/gpt-4o - Excellent for code analysis
 * 4. openai/gpt-3.5-turbo - Always available, fast, cost-effective fallback
 */
export const OPENROUTER_FALLBACK_MODELS = [
  {
    model: "openrouter/auto-beta",
    description: "OpenRouter auto-routing (primary)",
    maxRetries: 2,
    timeout: 60000, // 60 seconds
  },
  {
    model: "anthropic/claude-3.5-sonnet",
    description: "Claude 3.5 Sonnet (high quality fallback)",
    maxRetries: 2,
    timeout: 45000, // 45 seconds
  },
  {
    model: "openai/gpt-4o",
    description: "GPT-4o (reliable fallback)",
    maxRetries: 2,
    timeout: 45000, // 45 seconds
  },
  {
    model: "openai/gpt-3.5-turbo",
    description: "GPT-3.5 Turbo (always-available fallback)",
    maxRetries: 3,
    timeout: 30000, // 30 seconds
  },
] as const;

export interface OpenRouterCallOptions {
  systemMessage: string;
  userMessage: string;
  maxTokens?: number;
  temperature?: number;
  responseFormat?: { type: "json_object" | "text" };
  models?: string[]; // Override default fallback models
  skipValidation?: boolean; // Skip pre-request validation (for testing)
}

export interface OpenRouterResponse {
  success: boolean;
  content: string;
  model: string;
  tokensUsed: number;
  error?: string;
  attemptedModels?: string[];
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
 */
export async function testOpenRouterAvailability(): Promise<boolean> {
  try {
    validateApiKey();

    const openrouter = new OpenRouter({
      apiKey: process.env.OPENROUTER_API_KEY!
    });

    console.log("🔍 Testing OpenRouter API availability...");

    // Try with the primary model first
    const testModel = OPENROUTER_FALLBACK_MODELS[0].model;

    await Promise.race([
      openrouter.chat.send({
        chatRequest: {
          model: testModel,
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

    console.log("✅ OpenRouter API is available");
    return true;
  } catch (error: any) {
    console.error("❌ OpenRouter API availability test failed:", error.message);
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
    models,
    skipValidation = false,
  } = options;

  // Use custom models or default fallback list
  const modelsToTry: string[] = models || OPENROUTER_FALLBACK_MODELS.map(m => m.model);
  const attemptedModels: string[] = [];

  // Pre-request validation (unless skipped)
  if (!skipValidation) {
    const isAvailable = await testOpenRouterAvailability();
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
    const currentModel = modelsToTry[modelIndex]!; // Non-null assertion - we're iterating within bounds
    const modelConfig = OPENROUTER_FALLBACK_MODELS.find(m => m.model === currentModel) || {
      model: currentModel,
      description: "Custom model",
      maxRetries: 2,
      timeout: 45000,
    };

    console.log(`🤖 Attempting with model: ${modelConfig.model} (${modelConfig.description})`);
    attemptedModels.push(currentModel);

    // Retry logic for current model
    for (let retryCount = 0; retryCount <= modelConfig.maxRetries; retryCount++) {
      try {
        if (retryCount > 0) {
          const delay = calculateBackoffDelay(retryCount - 1);
          console.log(`   ⏳ Retry ${retryCount}/${modelConfig.maxRetries} after ${delay}ms delay...`);
          await new Promise(resolve => setTimeout(resolve, delay));
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
              ...(responseFormat && { responseFormat }),
            }
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Request timeout")), modelConfig.timeout)
          )
        ]) as any;

        // Extract response
        const content = result.choices?.[0]?.message?.content || "";
        const tokensUsed = result.usage?.total_tokens || 0;

        if (!content) {
          throw new Error("Empty response from OpenRouter");
        }

        console.log(`✅ Success with ${currentModel} (${tokensUsed} tokens)`);

        return {
          success: true,
          content,
          model: currentModel,
          tokensUsed,
          attemptedModels,
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
 * Convenience function for JSON responses
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
      return {
        ...result,
        success: false,
        error: "Failed to parse JSON response",
      };
    }
  }

  return result;
}
