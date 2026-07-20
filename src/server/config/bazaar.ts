/**
 * Bazaar Discovery Extension Configuration
 *
 * This file defines the metadata for all MCP tools to be indexed
 * on the x402 Bazaar discovery layer (agentic.market).
 */

import { getActiveNetwork } from "./network.js";
import { TOOL_CONFIG } from "./tools.js";

/**
 * ============================================
 * SERVICE METADATA - Edit this to customize how your service appears on agentic.market
 * ============================================
 */
export const SERVICE_METADATA = {
  name: "Remix Project",
  version: "1.0.0",
  website: "https://remix.live",
  logo: "https://remix.ethereum.org/assets/img/remix-logo-blue.png",  // Logo URL (PNG, JPG, or SVG recommended)
  description: "Professional Solidity compilation and security analysis services, powered by Remix Project. Compile smart contracts and run Slither security audits",
  tags: ["solidity", "ethereum", "smart-contracts", "security", "compilation", "remix"],
  category: "Development Tools",
  documentation: "https://github.com/remix-project-org/x402",
  support: "https://github.com/remix-project-org/x402/issues",
};

// Get the server base URL from environment or use default
const SERVER_BASE_URL = process.env.SERVER_BASE_URL || "http://localhost:8000";
// MCP endpoint is separate from HTTP x402 endpoints
// HTTP x402 endpoints are at SERVER_BASE_URL directly (e.g., /compile, /analyze)
// MCP endpoints remain at the MCP path
const MCP_ENDPOINT_HTTP = SERVER_BASE_URL.replace(/\/mcp\/x402-http$/, '/mcp/x402/mcp');
// For MCP resources, strip the protocol for mcp:// URIs
const MCP_ENDPOINT = MCP_ENDPOINT_HTTP.replace(/^https?:\/\//, '');

// Get payment configuration
const activeNetwork = getActiveNetwork();

/**
 * Bazaar metadata for compile_solidity tool
 */
export const COMPILE_SOLIDITY_METADATA = {
  resource: `${SERVER_BASE_URL}/compile`,
  type: "http" as const,
  description: "Compile Solidity smart contracts using the Remix compiler. Supports multiple files, custom compiler versions, optimizer settings, and various EVM versions.",
  accepts: [
    {
      asset: "USDC",
      amount: TOOL_CONFIG.payments.compileSolidity,
      network: `eip155:${activeNetwork.chainId}`,
      payTo: "", // Will be injected by injectPayToAddress()
      scheme: "exact" as const,
    },
  ],
  extensions: {
    bazaar: {
      info: {
        input: {
          type: "http" as const,
          method: "POST",
          description: "Compile Solidity smart contracts using the Remix compiler. Supports multiple files, custom compiler versions, optimizer settings, and various EVM versions.",
          bodyType: "json" as const,
          inputSchema: {
            type: "object",
            properties: {
              sources: {
                type: "object",
                description: "Map of filename to source code content",
                additionalProperties: {
                  type: "object",
                  properties: {
                    content: {
                      type: "string",
                      description: "Solidity source code",
                    },
                  },
                  required: ["content"],
                },
              },
              version: {
                type: "string",
                description: "Solidity compiler version (e.g., 'v0.8.35+commit.47b9dedd')",
              },
              settings: {
                type: "object",
                properties: {
                  optimizer: {
                    type: "object",
                    properties: {
                      enabled: { type: "boolean" },
                      runs: { type: "number" },
                    },
                  },
                  evmVersion: {
                    type: "string",
                    enum: ["homestead", "tangerineWhistle", "spuriousDragon", "byzantium", "constantinople", "petersburg", "istanbul", "berlin", "london", "paris", "shanghai", "osaka"],
                  },
                },
              },
            },
            required: ["sources"],
          },
          example: {
            sources: {
              "MyToken.sol": {
                content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MyToken {
    string public name = "MyToken";
    mapping(address => uint256) public balances;

    function mint(address to, uint256 amount) public {
        balances[to] += amount;
    }
}`,
              },
            },
            settings: {
              optimizer: {
                enabled: true,
                runs: 200,
              },
              evmVersion: "osaka",
            },
          },
        },
        output: {
          type: "json" as const,
          example: {
            success: true,
            contracts: {
              "MyToken.sol": {
                MyToken: {
                  abi: [
                    {
                      inputs: [],
                      name: "name",
                      outputs: [{ type: "string" }],
                      stateMutability: "view",
                      type: "function",
                    },
                  ],
                  evm: {
                    bytecode: {
                      object: "0x608060405234801561001057600080fd5...",
                    },
                  },
                },
              },
            },
            version: "v0.8.35+commit.47b9dedd",
          },
        },
      },
    },
  },
  serviceName: "Remix Compiler",
  tags: ["solidity", "compiler", "blockchain", "smart-contracts"],
};

/**
 * Bazaar metadata for analyze_with_slither tool
 */
export const ANALYZE_SLITHER_METADATA = {
  resource: `${SERVER_BASE_URL}/analyze`,
  type: "http" as const,
  description: "Run static security analysis on Solidity contracts using Slither. Detects vulnerabilities like reentrancy, unprotected functions, and code quality issues.",
  accepts: [
    {
      asset: "USDC",
      amount: TOOL_CONFIG.payments.analyzeWithSlither,
      network: `eip155:${activeNetwork.chainId}`,
      payTo: "", // Will be injected by injectPayToAddress()
      scheme: "exact" as const,
    },
  ],
  extensions: {
    bazaar: {
      info: {
        input: {
          type: "http" as const,
          method: "POST",
          description: "Run static security analysis on Solidity contracts using Slither. Detects vulnerabilities like reentrancy, unprotected functions, and code quality issues.",
          bodyType: "json" as const,
          inputSchema: {
            type: "object",
            properties: {
              sources: {
                type: "object",
                description: "Map of filename to source code content",
                additionalProperties: {
                  type: "object",
                  properties: {
                    content: { type: "string" },
                  },
                  required: ["content"],
                },
              },
              version: {
                type: "string",
                description: "Solidity compiler version",
              },
              detectors: {
                type: "array",
                items: { type: "string" },
                description: "Specific Slither detectors to run",
              },
              excludeLow: {
                type: "boolean",
                description: "Exclude low severity findings",
              },
              excludeInformational: {
                type: "boolean",
                description: "Exclude informational findings",
              },
            },
            required: ["sources"],
          },
          example: {
            sources: {
              "Contract.sol": {
                content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Example {
    mapping(address => uint256) public balances;

    function withdraw() public {
        uint256 amount = balances[msg.sender];
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success);
        balances[msg.sender] = 0;
    }
}`,
              },
            },
            excludeInformational: true,
          },
        },
        output: {
          type: "json" as const,
          example: {
            success: true,
            summary: {
              totalFindings: 2,
              high: 1,
              medium: 1,
              low: 0,
              informational: 0,
            },
            findings: [
              {
                check: "reentrancy-eth",
                impact: "High",
                confidence: "Medium",
                description: "Reentrancy in withdraw() function",
              },
            ],
          },
        },
      },
    },
  },
  serviceName: "Slither Analyzer",
  tags: ["security", "slither", "audit", "vulnerabilities"],
};

/**
 * Bazaar metadata for compile_and_deploy tool
 */
export const COMPILE_DEPLOY_METADATA = {
  resource: `mcp://${MCP_ENDPOINT}/compile_and_deploy`,
  type: "mcp" as const,
  description: "Compile and deploy a smart contract to a blockchain network. The server handles deployment using a delegated deployer. Supports constructor arguments, post-deployment calls, and multiple networks. Dynamic pricing based on gas costs.",
  accepts: [
    {
      asset: "USDC",
      amount: "50000", // Base fee, actual cost is dynamic
      network: `eip155:${activeNetwork.chainId}`,
      payTo: "", // Will be injected by injectPayToAddress()
      scheme: "dynamic" as const,
    },
  ],
  extensions: {
    bazaar: {
      info: {
        input: {
          type: "mcp" as const,
          toolName: "compile_and_deploy",
          description: "Compile and deploy a smart contract to a blockchain network. The server handles deployment using a delegated deployer. Supports constructor arguments, post-deployment calls, and multiple networks. Dynamic pricing based on gas costs.",
          transport: "streamable-http" as const,
          inputSchema: {
            type: "object",
            properties: {
              sources: {
                type: "object",
                description: "Map of filename to source code",
                additionalProperties: {
                  type: "object",
                  properties: { content: { type: "string" } },
                  required: ["content"],
                },
              },
              contractName: {
                type: "string",
                description: "Name of the contract to deploy",
              },
              contractFile: {
                type: "string",
                description: "Filename containing the contract",
              },
              network: {
                type: "string",
                enum: ["base-sepolia", "sepolia"],
                description: "Network to deploy to",
              },
              constructorArgs: {
                type: "array",
                description: "Constructor arguments",
              },
              version: {
                type: "string",
                description: "Solidity compiler version",
              },
              settings: {
                type: "object",
                description: "Compiler settings",
              },
              value: {
                type: "string",
                description: "Wei to send with deployment",
              },
              postDeploymentCall: {
                type: "object",
                properties: {
                  methodName: { type: "string" },
                  methodArgs: { type: "array" },
                  value: { type: "string" },
                },
                required: ["methodName"],
              },
            },
            required: ["sources", "contractName", "contractFile", "network"],
          },
          example: {
            sources: {
              "Counter.sol": {
                content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Counter {
    uint256 public count;

    constructor(uint256 _initial) {
        count = _initial;
    }

    function increment() public {
        count += 1;
    }
}`,
              },
            },
            contractName: "Counter",
            contractFile: "Counter.sol",
            network: "base-sepolia",
            constructorArgs: [0],
            postDeploymentCall: {
              methodName: "increment",
              methodArgs: [],
            },
          },
        },
        output: {
          type: "json" as const,
          example: {
            success: true,
            deployment: {
              contractAddress: "0x1234567890123456789012345678901234567890",
              transactionHash: "0xabcdef...",
              gasUsed: "500000",
              network: "base-sepolia",
            },
            abi: [],
          },
        },
      },
    },
  },
  serviceName: "Contract Deployer",
  tags: ["deployment", "blockchain", "contracts"],
};

/**
 * Bazaar metadata for compile_and_deploy_multi_network tool
 */
export const COMPILE_DEPLOY_MULTI_METADATA = {
  resource: `mcp://${MCP_ENDPOINT}/compile_and_deploy_multi_network`,
  type: "mcp" as const,
  description: "Compile once and deploy to multiple blockchain networks simultaneously. Ideal for cross-chain deployments. Dynamic pricing based on total gas costs across all networks.",
  accepts: [
    {
      asset: "USDC",
      amount: "55000", // Base fee with multi-network buffer
      network: `eip155:${activeNetwork.chainId}`,
      payTo: "", // Will be injected by injectPayToAddress()
      scheme: "dynamic" as const,
    },
  ],
  extensions: {
    bazaar: {
      info: {
        input: {
          type: "mcp" as const,
          toolName: "compile_and_deploy_multi_network",
          description: "Compile once and deploy to multiple blockchain networks simultaneously. Ideal for cross-chain deployments. Dynamic pricing based on total gas costs across all networks.",
          transport: "streamable-http" as const,
          inputSchema: {
            type: "object",
            properties: {
              sources: {
                type: "object",
                description: "Map of filename to source code",
                additionalProperties: {
                  type: "object",
                  properties: { content: { type: "string" } },
                  required: ["content"],
                },
              },
              contractName: {
                type: "string",
                description: "Name of the contract to deploy",
              },
              contractFile: {
                type: "string",
                description: "Filename containing the contract",
              },
              networks: {
                type: "array",
                items: {
                  type: "string",
                  enum: ["base-sepolia", "sepolia"],
                },
                description: "Networks to deploy to",
              },
              constructorArgs: {
                type: "array",
                description: "Constructor arguments (same for all networks)",
              },
              version: {
                type: "string",
                description: "Solidity compiler version",
              },
              settings: {
                type: "object",
                description: "Compiler settings",
              },
              postDeploymentCall: {
                type: "object",
                properties: {
                  methodName: { type: "string" },
                  methodArgs: { type: "array" },
                },
                required: ["methodName"],
              },
            },
            required: ["sources", "contractName", "contractFile", "networks"],
          },
          example: {
            sources: {
              "NFT.sol": {
                content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract SimpleNFT {
    string public name;
    uint256 public totalSupply;

    constructor(string memory _name) {
        name = _name;
    }

    function mint(address to) public {
        totalSupply += 1;
    }
}`,
              },
            },
            contractName: "SimpleNFT",
            contractFile: "NFT.sol",
            networks: ["base-sepolia", "sepolia"],
            constructorArgs: ["MyNFT"],
          },
        },
        output: {
          type: "json" as const,
          example: {
            success: true,
            deployments: [
              {
                network: "base-sepolia",
                success: true,
                contractAddress: "0x1234...",
                transactionHash: "0xabcd...",
              },
              {
                network: "sepolia",
                success: true,
                contractAddress: "0x5678...",
                transactionHash: "0xef01...",
              },
            ],
            summary: {
              total: 2,
              successful: 2,
              failed: 0,
            },
          },
        },
      },
    },
  },
  serviceName: "Multi-Network Deployer",
  tags: ["deployment", "multi-chain", "cross-chain"],
};

/**
 * Helper function to inject current PAY_TO_ADDRESS into metadata
 * This ensures the address is read from env at runtime, not at module load time
 * Validates that the address is not zero and properly formatted
 */
function injectPayToAddress(metadata: any) {
  const payTo = process.env.PAY_TO_ADDRESS;

  // Validate that PAY_TO_ADDRESS is set and not zero address
  if (!payTo) {
    throw new Error("PAY_TO_ADDRESS environment variable is not set. Payment address is required.");
  }

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  if (payTo.toLowerCase() === ZERO_ADDRESS.toLowerCase()) {
    throw new Error("PAY_TO_ADDRESS cannot be the zero address. Payments would be lost forever.");
  }

  // Basic validation: check if it looks like an Ethereum address
  if (!/^0x[a-fA-F0-9]{40}$/.test(payTo)) {
    throw new Error(`PAY_TO_ADDRESS is not a valid Ethereum address: ${payTo}`);
  }

  // Deep clone to avoid mutating the original
  const cloned = JSON.parse(JSON.stringify(metadata));

  // Inject payTo into each accepts entry
  if (cloned.accepts && Array.isArray(cloned.accepts)) {
    cloned.accepts.forEach((accept: any) => {
      accept.payTo = payTo;
    });
  }

  return cloned;
}

/**
 * Get all Bazaar metadata for all tools
 * Dynamically injects PAY_TO_ADDRESS from environment
 */
export function getAllBazaarMetadata() {
  return [
    injectPayToAddress(COMPILE_SOLIDITY_METADATA),
    injectPayToAddress(ANALYZE_SLITHER_METADATA),
    injectPayToAddress(COMPILE_DEPLOY_METADATA),
    injectPayToAddress(COMPILE_DEPLOY_MULTI_METADATA),
  ];
}

/**
 * Get Bazaar discovery response in the format expected by facilitators
 */
export function getBazaarDiscoveryResponse() {
  return {
    version: 2,
    resources: getAllBazaarMetadata(),
    lastUpdated: new Date().toISOString(),
    server: {
      name: SERVICE_METADATA.name,
      version: SERVICE_METADATA.version,
      endpoint: MCP_ENDPOINT_HTTP,
      network: activeNetwork.name,
      chainId: activeNetwork.chainId,
      website: SERVICE_METADATA.website,
      logo: SERVICE_METADATA.logo,
      description: SERVICE_METADATA.description,
      tags: SERVICE_METADATA.tags,
      category: SERVICE_METADATA.category,
      documentation: SERVICE_METADATA.documentation,
      support: SERVICE_METADATA.support,
    },
  };
}
