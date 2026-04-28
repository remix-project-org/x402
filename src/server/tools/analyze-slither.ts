import { withX402Payment, type FastMCP } from "@ampersend_ai/ampersend-sdk/mcp/server/fastmcp";
import { z } from "zod";
import { createPaymentRequirements, handlePayment } from "../utils/payment.js";

export function registerAnalyzeWithSlitherTool(mcp: FastMCP) {
  mcp.addTool({
  name: "analyze_with_slither",
  description: "Run Slither security analysis on Solidity contracts using Remix API. Accepts contract sources and returns security findings including vulnerabilities, optimizations, and best practice violations.",
  parameters: z.object({
    sources: z.record(z.string(), z.object({
      content: z.string()
    })).describe("Object with contract filenames as keys and their content"),
    version: z.string().optional().describe("Solidity compiler version (e.g., '0.8.26+commit.8a97fa7a'). Defaults to 0.8.26"),
    detectors: z.array(z.string()).optional().describe("Optional list of specific detectors to run (e.g., ['reentrancy-eth', 'tx-origin']). Filters results client-side."),
    excludeInformational: z.boolean().optional().describe("Exclude informational severity findings (default: false)"),
    excludeLow: z.boolean().optional().describe("Exclude low severity findings (default: false)")
  }),
  execute: withX402Payment({
    onExecute: async (_context: { args: unknown }) => {
      return createPaymentRequirements(
        "analyze_with_slither",
        "20000", // 0.02 USDC
        "Payment for Slither security analysis"
      );
    },
    onPayment: handlePayment,
  })(async (args: {
    sources: Record<string, { content: string }>,
    version?: string,
    detectors?: string[],
    excludeInformational?: boolean,
    excludeLow?: boolean
  }, _context: any) => {
    try {
      // Use Remix Slither API endpoint
      const SLITHER_API_URL = 'https://mcp.api.remix.live/slither/analyze';

      // Get the first source file's content (Remix API expects a single contract)
      const fileEntries = Object.entries(args.sources);
      if (fileEntries.length === 0) {
        throw new Error("No source files provided");
      }
      const firstEntry = fileEntries[0]!;
      const filename = firstEntry[0];
      const fileContent = firstEntry[1];

      // Prepare the request payload in Remix API format
      const requestPayload = {
        sources: {
          [filename]: {
            content: fileContent.content
          }
        },
        version: args.version || "0.8.26+commit.8a97fa7a"
      };

      console.log(`🔍 Sending Slither analysis request to Remix API...`);
      console.log(`   File: ${filename}`);

      // Make the API request
      const response = await fetch(SLITHER_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestPayload)
      });

      if (!response.ok) {
        throw new Error(`Remix API returned ${response.status}: ${response.statusText}`);
      }

      const slitherResult = await response.json();

      // Parse and format the Remix API response
      let analysisResult;

      if (slitherResult && slitherResult.success && slitherResult.analysis) {
        // Parse the text-based analysis output from Remix API
        const analysisText = slitherResult.analysis as string;

        // Extract detector findings from the text output
        const detectorMatches = analysisText.split('INFO:Detectors:\nDetector: ');
        const findings: any[] = [];

        // Skip the first element (before first detector)
        for (let i = 1; i < detectorMatches.length; i++) {
          const detectorBlock = detectorMatches[i];
          if (!detectorBlock) continue;

          const lines = detectorBlock.split('\n');
          const detectorName = lines[0]?.trim() || 'unknown';

          // Extract the description (everything before "Reference:")
          const referenceIndex = detectorBlock.indexOf('Reference:');
          const description = referenceIndex > 0
            ? detectorBlock.substring(detectorName.length, referenceIndex).trim()
            : detectorBlock.substring(detectorName.length).trim();

          // Extract reference URL if present
          const referenceMatch = detectorBlock.match(/Reference: (https?:\/\/[^\s]+)/);
          const reference = referenceMatch ? referenceMatch[1] : '';

          // Determine impact level based on detector name
          let impact = 'Informational';
          if (['reentrancy-eth', 'reentrancy-no-eth', 'suicidal', 'unprotected-upgrade'].includes(detectorName)) {
            impact = 'High';
          } else if (['reentrancy-benign', 'reentrancy-events', 'tx-origin', 'unchecked-transfer'].includes(detectorName)) {
            impact = 'Medium';
          } else if (['low-level-calls', 'naming-convention', 'solc-version'].includes(detectorName)) {
            impact = 'Low';
          }

          findings.push({
            check: detectorName,
            impact,
            confidence: 'Medium', // Default confidence
            description,
            reference
          });
        }

        // Apply client-side filters if requested
        let filteredFindings = findings;
        if (args.excludeInformational) {
          filteredFindings = filteredFindings.filter((f: any) => f.impact !== 'Informational');
        }
        if (args.excludeLow) {
          filteredFindings = filteredFindings.filter((f: any) => f.impact !== 'Low');
        }
        // Apply detector filter if specified
        if (args.detectors && args.detectors.length > 0) {
          filteredFindings = filteredFindings.filter((f: any) =>
            args.detectors!.includes(f.check)
          );
        }

        const summary = {
          totalFindings: filteredFindings.length,
          high: filteredFindings.filter((f: any) => f.impact === 'High').length,
          medium: filteredFindings.filter((f: any) => f.impact === 'Medium').length,
          low: filteredFindings.filter((f: any) => f.impact === 'Low').length,
          informational: filteredFindings.filter((f: any) => f.impact === 'Informational').length,
          optimization: filteredFindings.filter((f: any) => f.impact === 'Optimization').length
        };

        analysisResult = {
          success: true,
          summary,
          findings: filteredFindings,
          rawAnalysis: analysisText,
          rawOutput: slitherResult
        };

        console.log(`✅ Slither analysis completed`);
        console.log(`   Total findings: ${summary.totalFindings}`);
        console.log(`   High: ${summary.high}, Medium: ${summary.medium}, Low: ${summary.low}`);
      } else {
        analysisResult = {
          success: false,
          error: "Invalid response format from Remix API",
          rawOutput: slitherResult
        };
      }

      return JSON.stringify(analysisResult, null, 2);
    } catch (error: any) {
      console.error(`❌ Slither analysis failed:`, error.message);
      const result = {
        success: false,
        error: error.message || "Slither analysis failed"
      };
      return JSON.stringify(result, null, 2);
    }
  }),
  });
}
