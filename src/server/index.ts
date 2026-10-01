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

/**
 * Validate required environment variables
 * Exits the process with error if any required variables are missing
 */
function validateRequiredEnvVars(): void {
  const required: { name: string; description: string }[] = [
    {
      name: "SERVER_BASE_URL",
      description: "Public base URL for x402 endpoints (e.g., https://api.remix.live/mcp/x402-http)"
    },
    {
      name: "PAY_TO_ADDRESS",
      description: "Your wallet address to receive payments (e.g., 0x...)"
    },
    {
      name: "CDP_API_KEY_ID",
      description: "Coinbase Developer Platform API Key ID (get from https://portal.cdp.coinbase.com/)"
    },
    {
      name: "CDP_API_KEY_SECRET",
      description: "Coinbase Developer Platform API Secret"
    },
    {
      name: "OPENROUTER_API_KEY",
      description: "OpenRouter API key for AI audit endpoints (get from https://openrouter.ai)"
    }
  ];

  const missing = required.filter(({ name }) => !process.env[name]);

  if (missing.length > 0) {
    console.error("\n❌ CRITICAL: Missing required environment variables\n");
    console.error("The following environment variables are required but not set:\n");

    missing.forEach(({ name, description }) => {
      console.error(`  ❌ ${name}`);
      console.error(`     ${description}\n`);
    });

    console.error("Please set these variables in your .env file or environment.\n");
    console.error("Example .env file:");
    console.error("  SERVER_BASE_URL=https://api.remix.live/mcp/x402-http");
    console.error("  PAY_TO_ADDRESS=0xYourWalletAddress");
    console.error("  CDP_API_KEY_ID=your_cdp_key_id");
    console.error("  CDP_API_KEY_SECRET=your_cdp_secret");
    console.error("  OPENROUTER_API_KEY=your_openrouter_key\n");

    process.exit(1);
  }

  serverLogger.info("✅ All required environment variables are set");
}

// Validate environment variables before starting servers
validateRequiredEnvVars();

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
