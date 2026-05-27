import { FastMCP } from "@ampersend_ai/ampersend-sdk/mcp/server/fastmcp";
import dotenv from "dotenv";
import {
  registerCompileSolidityTool,
  registerAnalyzeWithSlitherTool,
  registerCompileAndDeploymentTool,
  registerMultiNetworkDeploymentTool
} from "./tools/index.js";
import { getActiveNetwork, getSupportedNetworks } from "./config/network.js";

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
registerMultiNetworkDeploymentTool(mcp);

// Get and display network configuration
const activeNetwork = getActiveNetwork();

// Start the MCP server with HTTP transport
mcp.start({
  transportType: "httpStream",
  httpStream: {
    port: 8000,
    endpoint: "/mcp"
  }
});

console.log("🚀 MCP Server running on http://localhost:8000/mcp");
console.log("\n⚙️  Network Configuration:");
console.log(`   Network: ${activeNetwork.displayName} (${activeNetwork.name})`);
console.log(`   Chain ID: ${activeNetwork.chainId}`);
console.log(`   RPC URL: ${activeNetwork.rpcUrl}`);
console.log(`   Explorer: ${activeNetwork.explorerUrl}`);
console.log(`   USDC Address: ${activeNetwork.usdcAddress}`);
console.log(`   💰 Payments will be processed on ${activeNetwork.displayName}`);
console.log("\n📦 Available tools:");
console.log("   - compile_solidity (0.01 USDC)");
console.log("   - analyze_with_slither (0.02 USDC)");
console.log("   - compile_and_deploy (dynamic pricing based on gas estimation, min 0.05 USDC)");
console.log("   - compile_and_deploy_multi_network (dynamic pricing for multiple networks)");
console.log(`\n💡 Available networks: ${getSupportedNetworks().join(", ")}`);
