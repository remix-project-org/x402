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

// Start the MCP server with HTTP transport
mcp.start({
  transportType: "httpStream",
  httpStream: {
    port: 8000,
    endpoint: "/mcp"
  }
});

console.log("🚀 MCP Server running on http://localhost:8000/mcp");