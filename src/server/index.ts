import { withX402Payment, FastMCP } from "@ampersend_ai/ampersend-sdk/mcp/server/fastmcp";
import { z } from "zod";
import { Compiler } from "@remix-project/remix-solidity";
import { verify } from "x402/facilitator";
import { createConnectedClient } from "x402/types";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// TODO: Update server name and version to match your application
const mcp = new FastMCP({
  name: "my-server",
  version: "1.0.0"
});

mcp.addTool({
  name: "paid_tool",
  description: "A tool that requires payment",
  parameters: z.object({ query: z.string() }),
  execute: withX402Payment({
    // Called before payment to determine payment requirements
    onExecute: async (_context: { args: unknown }) => {
      return {
        scheme: "exact" as const,
        description: "Payment for tool execution",
        network: "base-sepolia" as const, // TODO: Change network as needed (base, polygon, etc.)
        maxAmountRequired: "1000000", // TODO: Set your actual payment amount in wei/smallest unit
        resource: "paid_tool", // Resource identifier for this tool
        mimeType: "application/json",
        payTo: process.env.PAY_TO_ADDRESS || "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        maxTimeoutSeconds: 300,
        asset: "0x0000000000000000000000000000000000000000", // Native token (ETH) - use token address for ERC20
      };
    },
    // Called after payment is received
    // The SDK handles verification internally
    onPayment: async (context: any) => {
      const { payment } = context;
      console.log(`💰 Received payment for paid_tool`);
      console.log(`✅ Payment accepted`);

      return {
        success: true,
        transaction: "",
        network: payment.network,
      };
    },
  })(async (_args: { query: string }, _context: any) => {
    // TODO: Implement your actual tool logic here
    return "result";
  }),
});

mcp.addTool({
  name: "compile_solidity",
  description: "Compile Solidity contracts using Remix compiler. Accepts contract sources and returns compilation results.",
  parameters: z.object({
    sources: z.record(z.string(), z.object({
      content: z.string()
    })).describe("Object with contract filenames as keys and their content"),
    settings: z.object({
      optimizer: z.object({
        enabled: z.boolean().optional(),
        runs: z.number().optional()
      }).optional(),
      evmVersion: z.string().optional()
    }).optional().describe("Optional compiler settings")
  }),
  execute: withX402Payment({
    // Called before payment to determine payment requirements
    onExecute: async (_context: { args: unknown }) => {
      return {
        scheme: "exact" as const,
        description: "Payment for Solidity compilation",
        network: "base-sepolia" as const, // Base Sepolia testnet
        maxAmountRequired: "500000", // 0.5 USDC (6 decimals)
        resource: "compile_solidity",
        mimeType: "application/json",
        payTo: process.env.PAY_TO_ADDRESS as string,
        maxTimeoutSeconds: 300,
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // USDC on Base Sepolia
      };
    },
    // Called after payment authorization is received
    // Server VERIFIES the payment was settled on-chain BEFORE allowing compilation
    onPayment: async (context: any) => {
      const { payment, requirements } = context;

      console.log(`💰 Received payment authorization for compile_solidity`);
      console.log(`   From: ${payment.payload?.authorization?.from || 'unknown'}`);
      console.log(`   To: ${payment.payload?.authorization?.to || 'unknown'}`);
      console.log(`   Amount: ${payment.payload?.authorization?.value || '0'} USDC`);
      console.log(`   Network: ${payment.network}`);

      // Server VERIFIES the payment was settled on-chain BEFORE proceeding
      console.log(`\n⛓️  Verifying payment settlement on-chain...`);

      try {
        // Create a connected client (read-only) to verify settlement
        const client = createConnectedClient(requirements.network);

        console.log("   Payment object received:", JSON.stringify(payment, null, 2));

        // Verify the payment has been settled on-chain by the client
        const verifyResponse = await verify(client, payment, requirements);

        if (verifyResponse.isValid) {
          console.log(`✅ Payment verified as settled on-chain!`);
          console.log(`   Client settled and paid gas fees`);
          console.log(`   Server received USDC payment`);

          // Return success - payment is verified
          return {
            success: true,
            transaction: "", // Client already settled
            network: payment.network,
          };
        } else {
          console.log(`❌ Payment verification failed: ${verifyResponse.invalidReason}`);
          throw new Error(`Payment not settled on-chain: ${verifyResponse.invalidReason}`);
        }
      } catch (error: any) {
        console.error(`❌ Error during payment verification:`, error.message);
        throw new Error(`Payment verification failed: ${error.message}`);
      }
    },
  })(async (args: { sources: Record<string, { content: string }>, settings?: any }, _context: any) => {
    try {
      // Create compiler instance with import callback
      const compiler = new Compiler((importPath: string, cb: Function) => {
        const content = args.sources[importPath]?.content || "";
        cb(null, { content });
      });

      // Compile the contracts
      return new Promise((resolve) => {
        // Set compiler options
        compiler.set("evmVersion", args.settings?.evmVersion ?? "london");
        compiler.set("optimize", args.settings?.optimizer?.enabled ?? true);
        compiler.set("runs", args.settings?.optimizer?.runs ?? 200);

        // Register compilation finished event
        compiler.event.register("compilationFinished", (success: boolean, data: any, _source: any) => {
          if (success) {
            const result = {
              success: true,
              contracts: data.contracts,
              sources: data.sources,
              errors: data.errors?.filter((e: any) => e.severity === "warning") || []
            };
            resolve(JSON.stringify(result, null, 2));
          } else {
            const result = {
              success: false,
              errors: data.errors || []
            };
            resolve(JSON.stringify(result, null, 2));
          }
        });

        // Register compiler loaded event
        compiler.event.register("compilerLoaded", () => {
          // Compile with sources after compiler is loaded
          compiler.compile(args.sources, "");
        });

        // Use loadRemoteVersion for Node.js compatibility (no browser APIs)
        compiler.loadRemoteVersion("v0.8.26+commit.8a97fa7a");
      });
    } catch (error: any) {
      const result = {
        success: false,
        error: error.message || "Compilation failed"
      };
      return JSON.stringify(result, null, 2);
    }
  }),
});

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
    // Called before payment to determine payment requirements
    onExecute: async (_context: { args: unknown }) => {
      return {
        scheme: "exact" as const,
        description: "Payment for Slither security analysis",
        network: "base-sepolia" as const,
        maxAmountRequired: "750000", // 0.75 USDC (6 decimals)
        resource: "analyze_with_slither",
        mimeType: "application/json",
        payTo: process.env.PAY_TO_ADDRESS as string,
        maxTimeoutSeconds: 300,
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // USDC on Base Sepolia
      };
    },
    // Called after payment authorization is received
    onPayment: async (context: any) => {
      const { payment, requirements } = context;

      console.log(`💰 Received payment authorization for analyze_with_slither`);
      console.log(`   From: ${payment.payload?.authorization?.from || 'unknown'}`);
      console.log(`   To: ${payment.payload?.authorization?.to || 'unknown'}`);
      console.log(`   Amount: ${payment.payload?.authorization?.value || '0'} USDC`);
      console.log(`   Network: ${payment.network}`);

      // Server VERIFIES the payment was settled on-chain BEFORE proceeding
      console.log(`\n⛓️  Verifying payment settlement on-chain...`);

      try {
        // Create a connected client (read-only) to verify settlement
        const client = createConnectedClient(requirements.network);

        console.log("   Payment object received:", JSON.stringify(payment, null, 2));

        // Verify the payment has been settled on-chain by the client
        const verifyResponse = await verify(client, payment, requirements);

        if (verifyResponse.isValid) {
          console.log(`✅ Payment verified as settled on-chain!`);
          console.log(`   Client settled and paid gas fees`);
          console.log(`   Server received USDC payment`);

          // Return success - payment is verified
          return {
            success: true,
            transaction: "", // Client already settled
            network: payment.network,
          };
        } else {
          console.log(`❌ Payment verification failed: ${verifyResponse.invalidReason}`);
          throw new Error(`Payment not settled on-chain: ${verifyResponse.invalidReason}`);
        }
      } catch (error: any) {
        console.error(`❌ Error during payment verification:`, error.message);
        throw new Error(`Payment verification failed: ${error.message}`);
      }
    },
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
      // If multiple files are provided, we'll need to flatten or handle them
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
        version: args.version || "0.8.26+commit.8a97fa7a" // Use provided version or default
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

// Start the MCP server with HTTP transport
mcp.start({
  transportType: "httpStream",
  httpStream: {
    port: 8000,
    endpoint: "/mcp"
  }
});

console.log("🚀 MCP Server running on http://localhost:8000/mcp");