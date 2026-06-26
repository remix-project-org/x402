import { FastMCP } from "@ampersend_ai/ampersend-sdk/mcp/server/fastmcp";
import dotenv from "dotenv";
import {
  registerCompileSolidityTool,
  registerAnalyzeWithSlitherTool,
  registerCompileAndDeploymentTool,
  registerMultiNetworkDeploymentTool
} from "./tools/index.js";
import { getActiveNetwork, getSupportedNetworks } from "./config/network.js";
import { TOOL_CONFIG, usdcToUsd } from "./config/tools.js";
import { startDiscoveryServer, setupGracefulShutdown } from "./discovery.js";

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
console.log("\n🔧 Compiler Configuration:");
console.log(`   Solidity Version: ${TOOL_CONFIG.compiler.version}`);
console.log(`   EVM Version: ${TOOL_CONFIG.compiler.defaultSettings.evmVersion}`);
console.log(`   Optimizer: ${TOOL_CONFIG.compiler.defaultSettings.optimizer.enabled ? 'enabled' : 'disabled'} (${TOOL_CONFIG.compiler.defaultSettings.optimizer.runs} runs)`);
console.log("\n📦 Available tools:");
console.log(`   - compile_solidity ($${usdcToUsd(TOOL_CONFIG.payments.compileSolidity).toFixed(2)} USDC)`);
console.log(`   - analyze_with_slither ($${usdcToUsd(TOOL_CONFIG.payments.analyzeWithSlither).toFixed(2)} USDC)`);
console.log(`   - compile_and_deploy (dynamic pricing, base: $${TOOL_CONFIG.payments.compileAndDeploy.baseFeeUsd.toFixed(2)} USDC + gas + ${TOOL_CONFIG.payments.compileAndDeploy.serviceFeePercentage * 100}% fee)`);
console.log(`   - compile_and_deploy_multi_network (dynamic pricing for multiple networks)`);
console.log(`\n💡 Available networks: ${getSupportedNetworks().join(", ")}`);

// Start the Bazaar discovery server
const discoveryServer = startDiscoveryServer();
setupGracefulShutdown(discoveryServer);
