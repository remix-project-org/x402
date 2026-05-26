/**
 * Network Configuration
 *
 * This file provides centralized network configuration for the X402 MCP server.
 * To switch between networks, update the NETWORK environment variable in .env
 */

export interface NetworkConfig {
  name: string;
  displayName: string;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  usdcAddress: string;
}

/**
 * Available network configurations
 */
export const NETWORKS: Record<string, NetworkConfig> = {
  "base-sepolia": {
    name: "base-sepolia",
    displayName: "Base Sepolia Testnet",
    chainId: 84532,
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
    explorerUrl: "https://sepolia.basescan.org",
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
    usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  },
  "sepolia": {
    name: "sepolia",
    displayName: "Sepolia Testnet",
    chainId: 11155111,
    rpcUrl: process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
    explorerUrl: "https://sepolia.etherscan.io",
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
    usdcAddress: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", // Sepolia USDC
  },
  "base": {
    name: "base",
    displayName: "Base Mainnet",
    chainId: 8453,
    rpcUrl: process.env.BASE_RPC_URL || "https://mainnet.base.org",
    explorerUrl: "https://basescan.org",
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  },
};

/**
 * Get the active network configuration from environment
 * Defaults to base-sepolia if NETWORK is not set
 */
export function getActiveNetwork(): NetworkConfig {
  const networkName = process.env.NETWORK || "base-sepolia";
  const network = NETWORKS[networkName];

  if (!network) {
    throw new Error(
      `Invalid NETWORK "${networkName}". Available networks: ${Object.keys(NETWORKS).join(", ")}`
    );
  }

  return network;
}

/**
 * Get network configuration by name
 */
export function getNetworkByName(name: string): NetworkConfig {
  const network = NETWORKS[name];

  if (!network) {
    throw new Error(
      `Network "${name}" not found. Available networks: ${Object.keys(NETWORKS).join(", ")}`
    );
  }

  return network;
}

/**
 * Check if a network is supported
 */
export function isNetworkSupported(name: string): boolean {
  return name in NETWORKS;
}

/**
 * Get all supported network names
 */
export function getSupportedNetworks(): string[] {
  return Object.keys(NETWORKS);
}

/**
 * Get RPC URL for a specific network with fallback to default
 * Returns undefined if network is not in local config (allows viem to use its default RPC)
 */
export function getRpcUrl(networkName: string): string | undefined {
  // Check if network exists in local config
  if (!isNetworkSupported(networkName)) {
    // Network not in local config, return undefined to let viem use its default RPC
    console.log(`⚠️  Network "${networkName}" not in local config, using viem default RPC`);
    return undefined;
  }

  const network = getNetworkByName(networkName);
  return network.rpcUrl;
}

/**
 * Get explorer URL for a specific network
 */
export function getExplorerUrl(networkName: string): string {
  const network = getNetworkByName(networkName);
  return network.explorerUrl;
}
