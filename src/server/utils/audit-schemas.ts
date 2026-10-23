/**
 * Zod Schemas for Structured Audit Outputs
 *
 * These schemas define the structure for audit responses and are used with
 * the Instructor library to enforce type-safe, validated LLM outputs.
 *
 * Instructor automatically:
 * - Converts Zod schemas to JSON Schema
 * - Enforces structure at the LLM level (prevents malformed JSON)
 * - Validates responses automatically
 * - Retries on validation errors
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
