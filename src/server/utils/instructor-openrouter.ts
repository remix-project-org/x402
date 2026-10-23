/**
 * Instructor Integration for OpenRouter
 *
 * This module provides structured output extraction using the Instructor library
 * with OpenRouter models. It ensures type-safe, validated responses that prevent
 * malformed JSON issues.
 *
 * Benefits over manual JSON Schema approach:
 * - Automatic retry logic with validation
 * - Better error messages from Zod
 * - Forces LLM to respond in correct structure
 * - Prevents malformed JSON from models like Sonnet
 */

import Instructor from "@instructor-ai/instructor";
import OpenAI from "openai";
import { z } from "zod";
import { MODEL_FALLBACK_CONFIG, MODEL_MAPPINGS, type ModelName } from "./openrouter.js";

/**
 * Mode configuration for different OpenRouter models
 * - TOOLS: Best for most models (Claude, GPT, etc.)
 * - JSON: Fallback for models without tool support
 * - JSON_SCHEMA: For models with native JSON schema support
 */
type InstructorMode = "TOOLS" | "JSON" | "JSON_SCHEMA" | "MD_JSON";

/**
 * Options for Instructor-based OpenRouter calls
 */
export interface InstructorOptions<T extends z.ZodType> {
  /** System message for the LLM */
  systemMessage: string;

  /** User message/prompt */
  userMessage: string;

  /** Zod schema for response validation */
  schema: T;

  /** Name for the schema (used in function/tool calls) */
  schemaName: string;

  /** Primary model to use (DeepSeek, Sonnet, Fable) */
  modelName: ModelName;

  /** Maximum tokens for response */
  maxTokens?: number;

  /** Temperature (0-1) */
  temperature?: number;

  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;

  /** Instructor mode (default: TOOLS) */
  mode?: InstructorMode;
}

/**
 * Response from Instructor-based OpenRouter call
 */
export interface InstructorResponse<T> {
  /** Whether the call succeeded */
  success: boolean;

  /** Parsed and validated data (if successful) */
  data?: T;

  /** Error message (if failed) */
  error?: string;

  /** Model used for successful response */
  model?: string;

  /** List of models attempted */
  attemptedModels: string[];
}

/**
 * Create an Instructor client for OpenRouter
 */
function createInstructorClient(mode: InstructorMode = "TOOLS") {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY environment variable is not configured");
  }

  // Create OpenAI client pointing to OpenRouter
  const openai = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
    defaultHeaders: {
      "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "https://github.com/x402-protocol",
      "X-Title": "X402 Remix MCP Server"
    }
  });

  // Wrap with Instructor
  return Instructor({
    client: openai,
    mode: mode
  });
}

/**
 * Call OpenRouter with Instructor for structured outputs
 * Automatically handles fallbacks and retries
 *
 * @example
 * ```typescript
 * const result = await callInstructorWithFallback({
 *   systemMessage: "You are a security auditor",
 *   userMessage: "Analyze this contract...",
 *   schema: AuditChecklistResponseSchema,
 *   schemaName: "AuditChecklist",
 *   modelName: "Sonnet",
 *   maxRetries: 3
 * });
 *
 * if (result.success) {
 *   console.log(result.data); // Fully typed and validated!
 * }
 * ```
 */
export async function callInstructorWithFallback<T extends z.ZodType>(
  options: InstructorOptions<T>
): Promise<InstructorResponse<z.infer<T>>> {
  const {
    systemMessage,
    userMessage,
    schema,
    schemaName,
    modelName,
    maxTokens = 32768,
    temperature = 0.7,
    maxRetries = 3,
    mode = "TOOLS"
  } = options;

  // Get primary model and its fallbacks
  const primaryModelId = MODEL_MAPPINGS[modelName];
  const fallbackConfig = MODEL_FALLBACK_CONFIG[primaryModelId as keyof typeof MODEL_FALLBACK_CONFIG];
  const modelsToTry = fallbackConfig
    ? [primaryModelId, ...fallbackConfig.fallbacks]
    : [primaryModelId];

  const attemptedModels: string[] = [];

  console.log(`🎓 Using Instructor with ${mode} mode for structured output`);

  // Try each model in the fallback chain
  for (const currentModel of modelsToTry) {
    attemptedModels.push(currentModel);

    console.log(`🤖 Attempting with model: ${currentModel}`);

    try {
      // Create Instructor client
      const instructor = createInstructorClient(mode);

      // Call with automatic validation and retry
      const result = await instructor.chat.completions.create({
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
        model: currentModel,
        max_tokens: maxTokens,
        temperature: temperature,
        response_model: {
          schema: schema,
          name: schemaName
        },
        max_retries: maxRetries
      });

      console.log(`✅ Success with Instructor on model: ${currentModel}`);

      return {
        success: true,
        data: result as z.infer<T>,
        model: currentModel,
        attemptedModels
      };

    } catch (error: any) {
      const errorMsg = error.message || "Unknown error";
      console.error(`   ❌ Model ${currentModel} failed: ${errorMsg}`);

      // If this is a validation error, log details
      if (error.name === 'ZodError' || error.errors) {
        console.error(`   📋 Validation errors:`, JSON.stringify(error.errors || error, null, 2));
      }

      // If this was the last model, return error
      if (currentModel === modelsToTry[modelsToTry.length - 1]) {
        return {
          success: false,
          error: `All models failed. Last error: ${errorMsg}`,
          attemptedModels
        };
      }

      // Try next model
      console.log(`   ⚠️  Trying next fallback model...`);
    }
  }

  // Shouldn't reach here, but just in case
  return {
    success: false,
    error: "All fallback models failed",
    attemptedModels
  };
}

/**
 * Convenience wrapper for audit checklist extraction
 */
export async function extractAuditChecklist(
  contractCode: string,
  auditCategories: string,
  modelName: ModelName = "Sonnet"
) {
  // Import schema here to avoid circular dependency
  const { AuditChecklistResponseSchema } = await import("./audit-schemas.js");

  const systemMessage = `You are a Solidity security auditor analyzing smart contracts.
Your task is to match the contract code against relevant audit categories.

For each matched category:
1. Provide the exact category path from the checklist
2. Explain WHY it matches (cite specific code evidence)
3. Rate your confidence level (high/medium/low)

Only include categories that are CLEARLY relevant based on the actual code.
If no categories match, return an empty matches array with a brief skipped_reason.`;

  const userMessage = `Contract Code:
\`\`\`solidity
${contractCode}
\`\`\`

Available Audit Categories:
${auditCategories}

Match the contract against relevant categories.`;

  return callInstructorWithFallback({
    systemMessage,
    userMessage,
    schema: AuditChecklistResponseSchema,
    schemaName: "AuditChecklist",
    modelName,
    maxTokens: 32768,
    temperature: 0.7,
    maxRetries: 3,
    mode: "TOOLS" // TOOLS mode works best for Claude Sonnet
  });
}

/**
 * Convenience wrapper for full audit extraction
 */
export async function extractFullAudit(
  contractCode: string,
  auditChecklist: string,
  modelName: ModelName = "Sonnet"
) {
  // Import schema here to avoid circular dependency
  const { DoAuditResponseSchema } = await import("./audit-schemas.js");

  const systemMessage = `You are an expert Solidity security auditor performing a comprehensive smart contract audit.

Analyze the contract for:
1. Security vulnerabilities (reentrancy, access control, integer overflow, etc.)
2. Gas optimization opportunities
3. Code quality issues
4. Best practice violations

For each finding:
- Provide a clear title and severity level
- Explain the issue in detail
- Show the problematic code
- Describe the potential impact
- Recommend specific remediation steps

Focus on the audit categories provided in the checklist.`;

  const userMessage = `Contract Code:
\`\`\`solidity
${contractCode}
\`\`\`

Audit Focus Areas:
${auditChecklist}

Perform a comprehensive security audit.`;

  return callInstructorWithFallback({
    systemMessage,
    userMessage,
    schema: DoAuditResponseSchema,
    schemaName: "AuditReport",
    modelName,
    maxTokens: 65536, // Larger for full audit reports
    temperature: 0.7,
    maxRetries: 3,
    mode: "TOOLS"
  });
}
