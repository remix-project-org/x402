// Load environment variables FIRST - before any other imports
// This ensures PAY_TO_ADDRESS and other env vars are available when modules load
import dotenv from "dotenv";
dotenv.config();

import { FastMCP } from "@ampersend_ai/ampersend-sdk/mcp/server/fastmcp";
import {
  registerCompileSolidityTool,
  registerAnalyzeWithSlitherTool,
  registerCompileAndDeploymentTool,
  registerMultiNetworkDeploymentTool
} from "./tools/index.js";
import { getActiveNetwork, getSupportedNetworks } from "./config/network.js";
import { TOOL_CONFIG, usdcToUsd } from "./config/tools.js";
import { startDiscoveryServer, setupGracefulShutdown } from "./discovery.js";
import { startHttpX402Server } from "./http-x402.js";
import { serverLogger } from "./utils/logger.js";

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

serverLogger.info("MCP Server running on http://localhost:8000/mcp");
serverLogger.info({
  network: {
    name: activeNetwork.name,
    displayName: activeNetwork.displayName,
    chainId: activeNetwork.chainId,
    rpcUrl: activeNetwork.rpcUrl,
    explorerUrl: activeNetwork.explorerUrl,
    usdcAddress: activeNetwork.usdcAddress,
  },
}, "Network Configuration");
serverLogger.info({
  compiler: {
    version: TOOL_CONFIG.compiler.version,
    evmVersion: TOOL_CONFIG.compiler.defaultSettings.evmVersion,
    optimizer: {
      enabled: TOOL_CONFIG.compiler.defaultSettings.optimizer.enabled,
      runs: TOOL_CONFIG.compiler.defaultSettings.optimizer.runs,
    },
  },
}, "Compiler Configuration");
serverLogger.info({
  tools: {
    compile_solidity: `$${usdcToUsd(TOOL_CONFIG.payments.compileSolidity).toFixed(2)} USDC`,
    analyze_with_slither: `$${usdcToUsd(TOOL_CONFIG.payments.analyzeWithSlither).toFixed(2)} USDC`,
    compile_and_deploy: `dynamic pricing, base: $${TOOL_CONFIG.payments.compileAndDeploy.baseFeeUsd.toFixed(2)} USDC + gas + ${TOOL_CONFIG.payments.compileAndDeploy.serviceFeePercentage * 100}% fee`,
    compile_and_deploy_multi_network: "dynamic pricing for multiple networks",
  },
  supportedNetworks: getSupportedNetworks(),
}, "Available Tools");

// Start the Bazaar discovery server
const discoveryServer = startDiscoveryServer();
setupGracefulShutdown(discoveryServer);

// Start the HTTP x402 server (REST endpoints with 402 responses)
const httpX402Server = startHttpX402Server();
if (httpX402Server) {
  setupGracefulShutdown(httpX402Server);
}
