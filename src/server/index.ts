import { FastMCP } from "@ampersend_ai/ampersend-sdk/mcp/server/fastmcp";
import dotenv from "dotenv";
import {
  registerCompileSolidityTool,
  registerAnalyzeWithSlitherTool,
  registerCompileAndDeploymentTool
} from "./tools/index.js";

// Load environment variables
dotenv.config();

// Create MCP server instance
const mcp = new FastMCP({
  name: "remix-x402-server",
  version: "1.0.0"
});

// Register all tools
registerCompileSolidityTool(mcp);
registerAnalyzeWithSlitherTool(mcp);
registerCompileAndDeploymentTool(mcp);

// Start the MCP server with HTTP transport
mcp.start({
  transportType: "httpStream",
  httpStream: {
    port: 8000,
    endpoint: "/mcp"
  }
});

console.log("🚀 MCP Server running on http://localhost:8000/mcp");
console.log("📦 Available tools:");
console.log("   - compile_solidity (0.01 USDC)");
console.log("   - analyze_with_slither (0.02 USDC)");
console.log("   - compile_and_deploy (dynamic pricing based on gas estimation, min 0.05 USDC)");
