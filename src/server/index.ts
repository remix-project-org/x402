import { withX402Payment, FastMCP } from "@ampersend_ai/ampersend-sdk/mcp/server/fastmcp";
import { z } from "zod";
import { Compiler } from "@remix-project/remix-solidity";
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
    // Called after payment is received to verify it
    onPayment: async (_context: any) => {
      // TODO: Implement actual payment verification logic here
      return {
        transaction: "0x...", // TODO: This will be the actual transaction hash from payment
        success: true,
        network: "base-sepolia" as const,
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
        network: "base-sepolia" as const,
        maxAmountRequired: "500000", // Lower fee for compilation
        resource: "compile_solidity",
        mimeType: "application/json",
        payTo: process.env.PAY_TO_ADDRESS || "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        maxTimeoutSeconds: 300,
        asset: "0x0000000000000000000000000000000000000000",
      };
    },
    // Called after payment is received to verify it
    onPayment: async (_context: any) => {
      return {
        transaction: "0x...",
        success: true,
        network: "base-sepolia" as const,
      };
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