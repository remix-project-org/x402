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
    version: z.string().optional().describe("Solidity compiler version (e.g., '0.8.28+commit.7893614a'). Defaults to 0.8.28"),
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

      // Validate that sources are provided
      const fileEntries = Object.entries(args.sources);
      if (fileEntries.length === 0) {
        throw new Error("No source files provided");
      }

      // Prepare the request payload in Remix API format with all sources
      const requestPayload: any = {
        sources: args.sources,
        version: args.version || "0.8.28+commit.7893614a"
      };

      console.log(`🔍 Sending Slither analysis request to Remix API...`);
      console.log(`   Files: ${fileEntries.map(([name]) => name).join(', ')}`);

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
        // The analysis field is a JSON string, parse it first
        const analysisText = slitherResult.analysis as string;
        let analysisData;
        try {
          analysisData = JSON.parse(analysisText);
        } catch (parseError: any) {
          // If parsing fails, it's likely a compilation error message
          return JSON.stringify({
            success: false,
            error: `Failed to parse analysis result: ${parseError.message}. Raw output: ${analysisText.substring(0, 500)}`
          }, null, 2);
        }
        const findings: any[] = [];

        // Check if we have JSON-based results (new format)
        if (analysisData.results && analysisData.results.detectors && Array.isArray(analysisData.results.detectors)) {
          // Extract findings from the JSON detectors array
          for (const detector of analysisData.results.detectors) {
            findings.push({
              check: detector.check,
              impact: detector.impact,
              confidence: detector.confidence,
              description: detector.description || detector.markdown,
              elements: detector.elements,
              id: detector.id
            });
          }
        } else {
          // Fallback to text parsing if it's not JSON format
          const textToParse = typeof analysisData === 'string' ? analysisData : JSON.stringify(analysisData);
          const detectorSections = textToParse.split(/INFO:Detectors:\n/);

        // Process each detector section (skip first which is before any detectors)
        for (let i = 1; i < detectorSections.length; i++) {
          const section = detectorSections[i];
          if (!section || !section.trim()) continue;

          // Extract the reference URL for this section
          const referenceMatch = section.match(/Reference:\s*(https?:\/\/[^\s]+)/);
          const reference = referenceMatch ? referenceMatch[1] : '';

          // Get the description (everything before Reference or end of section)
          const referenceIndex = section.indexOf('Reference:');
          const nextSectionIndex = section.indexOf('INFO:');
          let endIndex = section.length;
          if (referenceIndex > 0) {
            endIndex = referenceIndex;
          } else if (nextSectionIndex > 0) {
            endIndex = nextSectionIndex;
          }

          const descriptionPart = section.substring(0, endIndex).trim();
          const fullDescription = descriptionPart;

          // Try to extract detector name from various patterns
          let detectorName = 'unknown';

          // Extract a meaningful check name from the content
          if (fullDescription.includes('has bitwise-xor operator')) {
            detectorName = 'incorrect-exp';
          } else if (fullDescription.includes('performs a multiplication on the result of a division')) {
            detectorName = 'divide-before-multiply';
          } else if (fullDescription.includes('uses assembly')) {
            detectorName = 'assembly';
          } else if (fullDescription.includes('different versions of Solidity')) {
            detectorName = 'solc-version';
          } else if (fullDescription.includes('is never used and should be removed')) {
            detectorName = 'dead-code';
          } else if (fullDescription.includes('contains known severe issues')) {
            detectorName = 'solc-version-issues';
          } else if (fullDescription.includes('uses literals with too many digits')) {
            detectorName = 'too-many-digits';
          }

          // Determine impact level based on detector name and content
          let impact = 'Informational';
          if (['reentrancy-eth', 'reentrancy-no-eth', 'suicidal', 'unprotected-upgrade', 'incorrect-exp'].includes(detectorName)) {
            impact = 'Medium';
          } else if (['divide-before-multiply', 'tx-origin', 'unchecked-transfer'].includes(detectorName)) {
            impact = 'Low';
          } else if (['assembly', 'solc-version', 'dead-code', 'solc-version-issues', 'too-many-digits'].includes(detectorName)) {
            impact = 'Informational';
          }

          // Parse individual findings within this detector section
          // Most detectors list individual instances, one per paragraph/block
          const lines = descriptionPart.split('\n');
          const individualFindings: string[] = [];
          let currentFinding = '';

          for (const line of lines) {
            const trimmedLine = line.trim();

            // Detect start of new finding based on patterns
            const isNewFinding =
              // Function/contract references like "Math.mulDiv(...)" or "Context._msgData()"
              (line.match(/^[A-Z][a-zA-Z0-9_]*\.[a-zA-Z_]/) && !line.startsWith('\t')) ||
              // Version constraints
              line.match(/^Version\s+constraint/) ||
              // Count statements like "7 different versions"
              line.match(/^\d+\s+different/) ||
              // It is used statements
              line.match(/^It\s+is\s+used\s+by:/) ||
              // Empty line followed by new content (paragraph separator)
              (!trimmedLine && currentFinding.trim());

            if (isNewFinding && currentFinding.trim()) {
              individualFindings.push(currentFinding.trim());
              currentFinding = trimmedLine ? line : '';
            } else if (trimmedLine) {
              currentFinding += (currentFinding ? '\n' : '') + line;
            }
          }

          // Add the last finding
          if (currentFinding.trim()) {
            individualFindings.push(currentFinding.trim());
          }

          // Create findings - if we successfully parsed individual items, use them
          // Otherwise treat the whole section as one finding
          if (individualFindings.length > 0) {
            for (const individualFinding of individualFindings) {
              findings.push({
                check: detectorName,
                impact,
                confidence: 'Medium',
                description: individualFinding,
                reference
              });
            }
          } else {
            findings.push({
              check: detectorName,
              impact,
              confidence: 'Medium',
              description: fullDescription,
              reference
            });
          }
        }
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
          rawOutput: slitherResult,
          compilerVersion: args.version || "0.8.28+commit.7893614a"
        };

        console.log(`✅ Slither analysis completed`);
        console.log(`   Total findings: ${summary.totalFindings}`);
        console.log(`   High: ${summary.high}, Medium: ${summary.medium}, Low: ${summary.low}, Informational: ${summary.informational}`);
      } else if (slitherResult && !slitherResult.success) {
        // Remix API returned an error
        analysisResult = {
          success: false,
          error: slitherResult.error || slitherResult.message || "Slither analysis failed",
          rawOutput: slitherResult
        };
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
