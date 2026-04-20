import { withX402Payment, FastMCP } from "@ampersend_ai/ampersend-sdk/mcp/server/fastmcp";
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
        resource: "paid_tool", // Resource identifier for this tool
        mimeType: "application/json",
        payTo: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", // TODO: Replace with actual payment recipient address
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

// Start the MCP server with HTTP transport
mcp.start({
  transportType: "httpStream",
  httpStream: {
    port: 8000,
    endpoint: "/mcp"
  }
});

console.log("🚀 MCP Server running on http://localhost:8000/mcp");