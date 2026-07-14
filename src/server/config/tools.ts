/**
 * Central configuration for all MCP tools
 * This file contains all configurable values used across different tools
 * to enable easy modification in one place.
 */

export const TOOL_CONFIG = {
  // Default Network Configuration
  defaultNetwork: "base-sepolia", // Can be overridden by X402_NETWORK env var

  // Default RPC URLs (can be overridden by env vars)
  defaultRpcUrls: {
    "base-sepolia": "https://sepolia.base.org",
    "sepolia": "https://ethereum-sepolia-rpc.publicnode.com",
    "base": "https://mainnet.base.org"
  },
  // Compiler Configuration
  compiler: {
    version: "v0.8.35+commit.47b9dedd",
    defaultSettings: {
      evmVersion: "osaka", // Default for Solidity 0.8.31+ (Fusaka upgrade)
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },

  // Slither Analysis Configuration
  slither: {
    apiUrl: "https://api.remix.live/mcp/slither/analyze",
    defaultVersion: "0.8.35+commit.47b9dedd"
  },

  // Payment Configuration (amounts in USDC with 6 decimals)
  payments: {
    compileSolidity: "10000",        // 0.01 USDC
    analyzeWithSlither: "20000",     // 0.02 USDC
    compileAndDeploy: {
      baseFee: "50000",              // 0.05 USDC (minimum/fallback)
      baseFeeUsd: 0.05,              // Base service fee in USD
      serviceFeePercentage: 0.3,     // 30% service fee on gas costs
      gasBufferPercentage: 0.2       // 20% buffer for gas estimation safety
    },
    multiNetworkDeploy: {
      baseFeeUsd: 0.05,              // Base service fee in USD
      serviceFeePercentage: 0.3,     // 30% service fee on gas costs
      gasBufferPercentage: 0.2,      // 20% buffer for gas estimation safety
      multiNetworkBufferPercentage: 0.1, // Additional 10% buffer for multi-network
      fallbackCostPerNetwork: 0.05   // Fallback cost per network if estimation fails
    }
  },

  // Gas Estimation Configuration
  gas: {
    ethUsdPrice: 3000,               // Conservative ETH price for cost estimation
    defaultMethodCallGasLimit: 200000, // Default gas limit for post-deployment calls
    fallbackMethodCallGas: 150000    // Fallback gas estimate for method calls
  },

  // Deployment Configuration
  deployment: {
    defaultConfirmations: 2          // Number of confirmations to wait for
  }
} as const;

/**
 * Helper function to convert USDC amount string to USD
 * @param usdcAmount - USDC amount as string (with 6 decimals)
 * @returns USD value as number
 */
export function usdcToUsd(usdcAmount: string): number {
  return parseInt(usdcAmount) / 1_000_000;
}

/**
 * Helper function to convert USD to USDC amount string
 * @param usdAmount - USD amount as number
 * @returns USDC amount as string (with 6 decimals)
 */
export function usdToUsdc(usdAmount: number): string {
  return Math.ceil(usdAmount * 1_000_000).toString();
}
