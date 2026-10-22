/**
 * Zod Schemas for Structured Audit Outputs
 *
 * These schemas ensure that LLM responses are properly structured and validated
 * before being returned to users. This prevents:
 * - Empty responses after payment settlement
 * - Unparseable JSON outputs
 * - Missing required fields
 * - Inconsistent response formats
 *
 * Used with OpenRouter's json_schema response format for guaranteed structure
 */

import { z } from "zod";

/**
 * Schema for audit checklist matching response
 * Used by /get_audit_checklist endpoint
 */
export const AuditMatchSchema = z.object({
  path: z.string().min(1).describe("Exact category path from the provided checklist"),
  reason: z.string().min(1).describe("Brief evidence (one sentence) for why this category applies"),
  confidence: z.enum(["high", "medium", "low"]).describe("Confidence level based on evidence strength")
});

export const AuditChecklistResponseSchema = z.object({
  matches: z.array(AuditMatchSchema).describe("Array of matched audit categories with evidence"),
  skipped_reason: z.string().optional().describe("Explanation if no categories matched (empty array case)")
});

export type AuditMatch = z.infer<typeof AuditMatchSchema>;
export type AuditChecklistResponse = z.infer<typeof AuditChecklistResponseSchema>;

/**
 * Schema for complete audit report response
 * Used by /do_audit endpoint
 */
export const AuditFindingSchema = z.object({
  title: z.string().min(1).describe("Brief title of the security issue"),
  severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFORMATIONAL"]).describe("Severity level of the finding"),
  description: z.string().min(1).describe("Detailed explanation of the issue"),
  location: z.string().optional().describe("File name and line number or function name where issue occurs"),
  code: z.string().optional().describe("Code snippet showing the issue"),
  impact: z.string().min(1).describe("What could happen if this issue is exploited"),
  remediation: z.string().min(1).describe("How to fix the issue with specific steps")
});

export const DoAuditResponseSchema = z.object({
  findings: z.array(AuditFindingSchema).min(0).describe("Array of security findings from the audit"),
  summary: z.string().min(20).describe("Executive summary of the audit (minimum 20 characters)"),
  recommendations: z.array(z.string()).min(0).describe("General recommendations for the project")
});

export type AuditFinding = z.infer<typeof AuditFindingSchema>;
export type DoAuditResponse = z.infer<typeof DoAuditResponseSchema>;

/**
 * Convert Zod schema to JSON Schema format for OpenRouter
 * OpenRouter requires JSON Schema v7 format with specific structure
 *
 * @param zodSchema - Zod schema to convert
 * @param name - Name for the schema (required by OpenRouter)
 * @returns JSON Schema object compatible with OpenRouter's json_schema format
 */
export function zodToJsonSchema(zodSchema: z.ZodType<any>, name: string): {
  name: string;
  strict: boolean;
  schema: {
    type: "object";
    properties: Record<string, any>;
    required: string[];
    additionalProperties: boolean;
  };
} {
  // Use Zod's internal JSON schema generation
  // Note: This is a simplified version - for production use zod-to-json-schema package
  const schema = zodSchema._def;

  // For now, return hand-crafted schemas that match our Zod definitions
  // In production, install and use: npm install zod-to-json-schema
  if (name === "audit_checklist_response") {
    return {
      name: name,
      strict: true,
      schema: {
        type: "object" as const,
        properties: {
          matches: {
            type: "array",
            description: "Array of matched audit categories with evidence",
            items: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description: "Exact category path from the provided checklist"
                },
                reason: {
                  type: "string",
                  description: "Brief evidence (one sentence) for why this category applies"
                },
                confidence: {
                  type: "string",
                  enum: ["high", "medium", "low"],
                  description: "Confidence level based on evidence strength"
                }
              },
              required: ["path", "reason", "confidence"],
              additionalProperties: false
            }
          },
          skipped_reason: {
            type: "string",
            description: "Explanation if no categories matched (empty array case)"
          }
        },
        required: ["matches"],
        additionalProperties: false
      }
    };
  }

  if (name === "audit_report_response") {
    return {
      name: name,
      strict: true,
      schema: {
        type: "object" as const,
        properties: {
          findings: {
            type: "array",
            description: "Array of security findings from the audit",
            items: {
              type: "object",
              properties: {
                title: {
                  type: "string",
                  description: "Brief title of the security issue"
                },
                severity: {
                  type: "string",
                  enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFORMATIONAL"],
                  description: "Severity level of the finding"
                },
                description: {
                  type: "string",
                  description: "Detailed explanation of the issue"
                },
                location: {
                  type: "string",
                  description: "File name and line number or function name where issue occurs"
                },
                code: {
                  type: "string",
                  description: "Code snippet showing the issue"
                },
                impact: {
                  type: "string",
                  description: "What could happen if this issue is exploited"
                },
                remediation: {
                  type: "string",
                  description: "How to fix the issue with specific steps"
                }
              },
              required: ["title", "severity", "description", "impact", "remediation"],
              additionalProperties: false
            }
          },
          summary: {
            type: "string",
            description: "Executive summary of the audit (minimum 20 characters)"
          },
          recommendations: {
            type: "array",
            description: "General recommendations for the project",
            items: {
              type: "string"
            }
          }
        },
        required: ["findings", "summary", "recommendations"],
        additionalProperties: false
      }
    };
  }

  throw new Error(`Unknown schema name: ${name}`);
}

/**
 * Validate and parse audit checklist response
 * Throws ZodError if validation fails
 */
export function validateAuditChecklistResponse(data: unknown): AuditChecklistResponse {
  return AuditChecklistResponseSchema.parse(data);
}

/**
 * Validate and parse audit report response
 * Throws ZodError if validation fails
 */
export function validateDoAuditResponse(data: unknown): DoAuditResponse {
  return DoAuditResponseSchema.parse(data);
}

/**
 * Safe validation that returns result object instead of throwing
 */
export function safeValidateAuditChecklistResponse(data: unknown) {
  return AuditChecklistResponseSchema.safeParse(data);
}

export function safeValidateDoAuditResponse(data: unknown) {
  return DoAuditResponseSchema.safeParse(data);
}
