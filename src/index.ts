import { withX402Payment } from "@ampersend_ai/ampersend-sdk/mcp/server/fastmcp";
import { FastMCP } from "fastmcp";
import { z } from "zod";

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
        resource: "0x0000000000000000000000000000000000000000", // TODO: Replace with actual resource address
        to: "0x0000000000000000000000000000000000000000", // TODO: Replace with actual recipient address
        receiver: "0x0000000000000000000000000000000000000000", // TODO: Replace with actual receiver address
        chainId: 84532, // Base Sepolia testnet - TODO: Update if using different network
        mimeType: "application/json",
        payTo: "0x0000000000000000000000000000000000000000", // TODO: Replace with actual payment recipient
        maxTimeoutSeconds: 300,
        asset: "0x0000000000000000000000000000000000000000", // TODO: Replace with actual token address (0x0 for native token)
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

// Start the MCP server with HTTP transport
mcp.start({
  transportType: "httpStream",
  httpStream: {
    port: 8000,
    endpoint: "/mcp"
  }
});

console.log("🚀 MCP Server running on http://localhost:8000/mcp");