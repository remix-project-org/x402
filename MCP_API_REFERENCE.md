# MCP API Reference

Complete documentation for using the MCP (Model Context Protocol) server with AI agents like Claude.

> **📌 Note**: This document covers **MCP tools only**. For HTTP REST endpoints, see [HTTP_API_REFERENCE.md](HTTP_API_REFERENCE.md).

## Table of Contents

- [Overview](#overview)
- [Getting Started](#getting-started)
- [Available Tools](#available-tools)
  - [compile_solidity](#compile_solidity)
  - [analyze_with_slither](#analyze_with_slither)
  - [compile_and_deploy](#compile_and_deploy) - **MCP Only**
  - [compile_and_deploy_multi_network](#compile_and_deploy_multi_network) - **MCP Only**
- [Payment Flow](#payment-flow)
- [Tool Usage Examples](#tool-usage-examples)
- [Error Handling](#error-handling)
- [FAQ](#faq)
- [Support](#support)

---

## Overview

The Remix x402 MCP Server provides paid Solidity development tools through the Model Context Protocol for AI agents like Claude.

### What is x402?

x402 is a micropayment protocol that enables pay-per-use services. You pay small amounts of USDC for each tool usage, and payments are settled on-chain using gasless signatures (EIP-3009).

### What are MCP Tools?

MCP (Model Context Protocol) tools are designed for AI agents to interact with services through structured tool calls. These tools are accessible via:
- **Claude Desktop** - GUI application with MCP support
- **Claude Code CLI** - Terminal interface with MCP support
- **Custom MCP clients** - Any application implementing the MCP protocol

### Key Features

- **Ampersend SDK Payment**: Client-side payment handling with on-chain settlement
- **Client Pays Gas**: You pay gas fees when settling payments (~$0.50-$2.00)
- **Solidity Compilation**: Compile contracts with the Remix compiler
- **Security Analysis**: Run Slither analysis on your contracts
- **Delegated Deployment**: Server deploys contracts on your behalf (MCP only)
- **Multi-Network Support**: Deploy to multiple networks simultaneously (MCP only)

### MCP vs HTTP

| Feature | MCP Server | HTTP Server |
|---------|-----------|-------------|
| **Target** | AI agents (Claude) | Web apps, REST clients |
| **Payment Library** | Ampersend SDK | @x402/fetch |
| **Gas Fees** | Client pays | Facilitator pays ✅ |
| **Deployment Tools** | ✅ Available | ❌ Not available |
| **Setup Guide** | [CLAUDE_SELF_MANAGED_WALLET.md](CLAUDE_SELF_MANAGED_WALLET.md) | [HTTP_API_REFERENCE.md](HTTP_API_REFERENCE.md) |

> **🧪 Testnet**: Currently operates on **Base Sepolia testnet** for testing and evaluation. Mainnet support coming soon!

---

## Getting Started

### Prerequisites

1. **Node.js**: Version 18 or higher required
   - Check your version: `node --version`
   - Download from [nodejs.org](https://nodejs.org/)

2. **Wallet with Funds**: A wallet with both ETH and USDC on Base Sepolia testnet
   - **Base Sepolia USDC**: 1-5 USDC for paying for services
   - **Base Sepolia ETH**: ~0.01 ETH for gas when settling payments
   - No real money required - testnet only!

### Installation

```bash
# Clone the repository
git clone https://github.com/remix-project-org/x402.git
cd x402

# Install dependencies
yarn install
```

### Wallet Setup & Configuration

The MCP client needs a wallet to sign x402 payment authorizations. The wallet is configured via environment variables.

#### Step 1: Set Your Private Key

Create a `.env` file in the project root:

```bash
# .env file
PRIVATE_KEY=0xYourPrivateKeyHere
```

Or set it as an environment variable:

```bash
export PRIVATE_KEY="0xYourPrivateKeyHere"
```

#### Step 2: Fund Your Wallet

Your wallet needs:
- **Base Sepolia USDC** - To pay for services (1-5 USDC recommended)
- **Base Sepolia ETH** - To pay gas for payment settlements (~0.01 ETH)

Check balance at: `https://sepolia.basescan.org/address/YOUR_ADDRESS`

#### Step 3: Use the Client

```javascript
import { createMCPClient } from './src/lib/index.js';

// Client reads PRIVATE_KEY from environment
const { client, transport, wallet } = createMCPClient(serverUrl, {
  name: 'Your-App-Name',
  version: '1.0.0'
});
```

**Security Note:**
- Never commit your `.env` file to git
- Your private key never leaves your machine
- The client only uses it to sign payment authorizations

### Quick Start Script

> **💡 Prefer using Claude?** All these examples can work automatically through Claude Desktop or Claude Code CLI - see **[CLAUDE_SELF_MANAGED_WALLET.md](CLAUDE_SELF_MANAGED_WALLET.md)**

Here's a complete working example for programmatic use:

```javascript
import { createMCPClient } from './src/lib/index.js';

async function main() {
  // Create client (reads PRIVATE_KEY from .env)
  const serverUrl = 'https://api.remix.live/mcp/x402/mcp';
  const { client, transport, wallet } = createMCPClient(serverUrl, {
    name: 'My-Remix-App',
    version: '1.0.0'
  });

  // Wallet address is logged automatically by createMCPClient
  // Make sure this address has USDC and ETH on Base Sepolia!

  // Connect to server
  await client.connect(transport);
  console.log('Connected to Remix x402 MCP Server\n');

  // Use a tool - payment happens automatically
  console.log('Compiling contract (cost: 0.01 USDC)...');
  const result = await client.callTool({
    name: "compile_solidity",
    arguments: {
      sources: {
        "HelloWorld.sol": {
          content: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract HelloWorld {
    string public message = "Hello, World!";
}
          `
        }
      }
    }
  });

  // View results
  const output = JSON.parse(result.content[0].text);
  console.log('✓ Compilation successful!');
  console.log('Contract ABI:', output.contracts['HelloWorld.sol'].HelloWorld.abi);
}

main().catch(console.error);
```

**To run:**
1. Create `.env` file with your `PRIVATE_KEY`
2. Save script as `example.js`
3. Run: `node example.js`

---

## Available Tools

### compile_solidity

Compile Solidity smart contracts using the Remix compiler.

**Price**: 0.01 USDC

**Available via**: MCP + HTTP

#### Input Parameters

```typescript
{
  sources: {
    [filename: string]: {
      content: string
    }
  },
  version?: string,
  settings?: {
    optimizer?: {
      enabled: boolean,
      runs: number
    },
    evmVersion?: string
  }
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sources` | Object | Yes | Map of filename to source code content |
| `sources[filename].content` | string | Yes | Solidity source code |
| `version` | string | No | Solidity compiler version (default: "v0.8.35+commit.47b9dedd") |
| `settings` | Object | No | Compiler settings |
| `settings.optimizer.enabled` | boolean | No | Enable optimizer (default: false) |
| `settings.optimizer.runs` | number | No | Optimizer runs (default: 200) |
| `settings.evmVersion` | string | No | EVM version (default: "osaka") |

#### Output

```typescript
{
  success: boolean,
  contracts?: {
    [filename: string]: {
      [contractName: string]: {
        abi: Array<Object>,
        evm: {
          bytecode: { object: string, ... },
          deployedBytecode: { object: string, ... },
          methodIdentifiers: Object,
          gasEstimates: Object
        },
        metadata: string
      }
    }
  },
  errors?: Array<{
    severity: "error" | "warning",
    message: string,
    formattedMessage: string
  }>,
  version?: string
}
```

#### Example

```javascript
const result = await client.callTool({
  name: "compile_solidity",
  arguments: {
    sources: {
      "MyToken.sol": {
        content: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MyToken {
    string public name = "MyToken";
    mapping(address => uint256) public balances;

    function mint(address to, uint256 amount) public {
        balances[to] += amount;
    }
}
        `
      }
    },
    version: "v0.8.20+commit.a1b79de6",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "paris"
    }
  }
});

const output = JSON.parse(result.content[0].text);
console.log('Compiler version:', output.version);
console.log('ABI:', output.contracts['MyToken.sol'].MyToken.abi);
```

---

### analyze_with_slither

Run static security analysis on Solidity contracts using Slither.

**Price**: 0.02 USDC

**Available via**: MCP + HTTP

#### Input Parameters

```typescript
{
  sources: {
    [filename: string]: {
      content: string
    }
  },
  version?: string,
  detectors?: Array<string>,
  excludeLow?: boolean,
  excludeInformational?: boolean
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sources` | Object | Yes | Map of filename to source code content |
| `version` | string | No | Solidity compiler version |
| `detectors` | Array<string> | No | Specific Slither detectors to run |
| `excludeLow` | boolean | No | Exclude low severity findings (default: false) |
| `excludeInformational` | boolean | No | Exclude informational findings (default: false) |

#### Output

```typescript
{
  success: boolean,
  summary?: {
    totalFindings: number,
    high: number,
    medium: number,
    low: number,
    informational: number
  },
  findings?: Array<{
    check: string,
    impact: "High" | "Medium" | "Low" | "Informational",
    confidence: "High" | "Medium" | "Low",
    description: string,
    reference?: string
  }>,
  error?: string
}
```

#### Example

```javascript
const result = await client.callTool({
  name: "analyze_with_slither",
  arguments: {
    sources: {
      "Vulnerable.sol": {
        content: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Vulnerable {
    mapping(address => uint256) public balances;

    function withdraw() public {
        uint256 amount = balances[msg.sender];
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success);
        balances[msg.sender] = 0; // State change after external call!
    }
}
        `
      }
    },
    excludeInformational: true
  }
});

const output = JSON.parse(result.content[0].text);
console.log('Summary:', output.summary);
output.findings.forEach(finding => {
  console.log(`[${finding.impact}] ${finding.check}: ${finding.description}`);
});
```

---

### compile_and_deploy

Compile and deploy a smart contract to a single network using the server's delegated deployment service.

**Price**: Dynamic - `(Gas Cost × 1.3) + 0.05 USDC`

**Available via**: **MCP only** (not available via HTTP)

#### Input Parameters

```typescript
{
  sources: {
    [filename: string]: {
      content: string
    }
  },
  contractName: string,
  contractFile: string,
  network: string,
  constructorArgs?: Array<any>,
  version?: string,
  settings?: {
    optimizer?: {
      enabled: boolean,
      runs: number
    },
    evmVersion?: string
  },
  value?: string,
  postDeploymentCall?: {
    methodName: string,
    methodArgs?: Array<any>,
    value?: string
  }
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sources` | Object | Yes | Map of filename to source code content |
| `contractName` | string | Yes | Name of the contract to deploy |
| `contractFile` | string | Yes | Filename containing the contract |
| `network` | string | Yes | Network to deploy to (e.g., "base-sepolia") |
| `constructorArgs` | Array | No | Constructor arguments for the contract |
| `version` | string | No | Solidity compiler version |
| `settings` | Object | No | Compiler settings |
| `value` | string | No | Value in wei to send with deployment |
| `postDeploymentCall` | Object | No | Optional method to call after deployment |

#### Supported Networks

Currently on testnet:
- `base-sepolia` - Base Sepolia testnet (primary)
- `sepolia` - Ethereum Sepolia testnet

> **Note**: On mainnet launch, additional networks like `base`, `mainnet`, `polygon`, `arbitrum`, `optimism` will be available.

#### Output

```typescript
{
  success: boolean,
  compilation?: {
    version: string,
    warnings: Array<any>
  },
  deployment?: {
    success: boolean,
    contractAddress: string,
    transactionHash: string,
    blockNumber: string,
    gasUsed: string,
    network: string,
    deployerAddress: string
  },
  abi?: Array<Object>,
  postDeploymentCall?: {
    success: boolean,
    methodName: string,
    transactionHash?: string,
    error?: string
  },
  error?: string
}
```

#### Example

```javascript
const result = await client.callTool({
  name: "compile_and_deploy",
  arguments: {
    sources: {
      "Counter.sol": {
        content: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Counter {
    uint256 public count;
    address public owner;

    constructor(uint256 _initialCount) {
        count = _initialCount;
        owner = msg.sender;
    }

    function increment() public {
        count += 1;
    }
}
        `
      }
    },
    contractName: "Counter",
    contractFile: "Counter.sol",
    network: "base-sepolia",
    constructorArgs: [42],
    postDeploymentCall: {
      methodName: "increment",
      methodArgs: []
    }
  }
});

const output = JSON.parse(result.content[0].text);
console.log('Contract deployed at:', output.deployment.contractAddress);
console.log('Transaction:', output.deployment.transactionHash);
console.log('View on explorer: https://sepolia.basescan.org/address/' + output.deployment.contractAddress);
```

---

### compile_and_deploy_multi_network

Compile once and deploy to multiple networks simultaneously.

**Price**: Dynamic - `(Total Gas Across Networks × 1.3) + 0.05 USDC + 10% multi-network buffer`

**Available via**: **MCP only** (not available via HTTP)

#### Input Parameters

```typescript
{
  sources: {
    [filename: string]: {
      content: string
    }
  },
  contractName: string,
  contractFile: string,
  networks: Array<string>,
  constructorArgs?: Array<any>,
  version?: string,
  settings?: {
    optimizer?: {
      enabled: boolean,
      runs: number
    },
    evmVersion?: string
  },
  postDeploymentCall?: {
    methodName: string,
    methodArgs?: Array<any>
  }
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sources` | Object | Yes | Map of filename to source code content |
| `contractName` | string | Yes | Name of the contract to deploy |
| `contractFile` | string | Yes | Filename containing the contract |
| `networks` | Array<string> | Yes | List of networks to deploy to |
| `constructorArgs` | Array | No | Constructor arguments (same for all networks) |
| `version` | string | No | Solidity compiler version |
| `settings` | Object | No | Compiler settings |
| `postDeploymentCall` | Object | No | Method to call after each deployment |

#### Output

```typescript
{
  success: boolean,
  compilation?: {
    version: string,
    warnings: Array<any>
  },
  deployments: Array<{
    network: string,
    success: boolean,
    contractAddress?: string,
    transactionHash?: string,
    blockNumber?: string,
    gasUsed?: string,
    deployerAddress?: string,
    postDeploymentCall?: {
      success: boolean,
      methodName: string,
      transactionHash?: string,
      error?: string
    },
    error?: string
  }>,
  abi?: Array<Object>,
  summary?: {
    total: number,
    successful: number,
    failed: number
  },
  error?: string
}
```

#### Example

```javascript
const result = await client.callTool({
  name: "compile_and_deploy_multi_network",
  arguments: {
    sources: {
      "NFT.sol": {
        content: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract SimpleNFT {
    string public name;
    string public symbol;
    uint256 public totalSupply;

    constructor(string memory _name, string memory _symbol) {
        name = _name;
        symbol = _symbol;
    }

    function mint(address to, uint256 tokenId) public {
        totalSupply += 1;
    }
}
        `
      }
    },
    contractName: "SimpleNFT",
    contractFile: "NFT.sol",
    networks: ["base-sepolia", "sepolia"],
    constructorArgs: ["MyNFT", "MNFT"],
    postDeploymentCall: {
      methodName: "mint",
      methodArgs: ["0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1", 1]
    }
  }
});

const output = JSON.parse(result.content[0].text);
console.log('Summary:', output.summary);

// Check results for each network
output.deployments.forEach(deployment => {
  if (deployment.success) {
    console.log(`${deployment.network}: ${deployment.contractAddress}`);
    console.log(`  Transaction: ${deployment.transactionHash}`);
  } else {
    console.log(`${deployment.network}: Failed - ${deployment.error}`);
  }
});
```

---

## Payment Flow

The MCP server uses the **Ampersend SDK** for payment handling:

```
Client                          Server                    Blockchain
  |                               |                            |
  |---(1) Call Tool-------------->|                            |
  |      (via MCP)                |                            |
  |                               |                            |
  |                       (2) Estimate Cost                    |
  |                       (for deployments)                    |
  |                               |                            |
  |<--(3) Payment Required--------|                            |
  |      (amount, USDC address,   |                            |
  |       network, nonce)         |                            |
  |                               |                            |
  |===(4) Create Authorization=================|              |
  |      (EIP-3009 signature)                  |              |
  |      Gasless - no gas for signing!         |              |
  |                               |                            |
  |---(5) Settle On-Chain---------|--------------------------->|
  |      (executeTransferWithAuthorization)    |              |
  |      YOUR WALLET pays gas for this step    |              |
  |                               |                            |
  |                               |<--(6) TX Confirmed---------|
  |                               |      (payment verified)    |
  |                               |                            |
  |                       (7) Verify Settlement                |
  |                       (read blockchain)                    |
  |                               |                            |
  |                       (8) Execute Tool                     |
  |                       (compile, analyze, deploy)           |
  |                               |                            |
  |<--(9) Return Results----------|                            |
  |      (compilation output,     |                            |
  |       analysis, deployment)   |                            |
```

**Key Points:**
- **Step 4**: Gasless signature creation (EIP-712) - no cost
- **Step 5**: YOUR wallet submits transaction on-chain - YOU pay gas (~$0.50-$2.00)
- **Step 6**: Payment settles directly on blockchain via EIP-3009
- **Step 7**: Server verifies payment by reading blockchain
- **Cost**: Service fee (0.01-0.02 USDC) + Gas fees (~$0.50-$2.00)

**MCP vs HTTP Payment:**
- **MCP**: Client pays gas fees (Ampersend SDK handles settlement)
- **HTTP**: Facilitator pays gas fees (no gas cost to client!)
- **MCP**: Simpler integration for AI agents
- **HTTP**: Better for web apps where cost matters

### How Payments Work

When you call a tool, the payment flow happens automatically:

```javascript
// You call a tool
const result = await client.callTool({
  name: "compile_solidity",
  arguments: { /* ... */ }
});

// Behind the scenes, the client:
// 1. Receives payment request from server (amount + nonce)
// 2. Uses YOUR WALLET to sign a USDC transfer authorization (EIP-3009)
//    - This is a gasless signature (no gas cost)
//    - Authorizes the server to receive USDC from your wallet
// 3. Submits the signed authorization on-chain (YOU pay gas for this)
// 4. Server verifies payment on-chain
// 5. Server executes the tool
// 6. You receive the results
```

### Pricing Details

**Fixed Price Tools:**
- **Compilation**: 0.01 USDC per compilation
- **Security Analysis**: 0.02 USDC per analysis

**Dynamic Price Tools (Deployment):**

The deployment cost is calculated as:
```
Total Cost = (Estimated Gas Cost × 1.3) + Base Fee + Buffer
```

Where:
- **Estimated Gas Cost**: Cost to deploy your contract + post-deployment call (if any)
- **30% Service Fee**: Covers server operation and profit
- **Base Fee**: 0.05 USDC flat fee
- **Multi-Network Buffer**: Additional 10% for multi-network deployments

**Example Calculation (Base Sepolia):**
- Estimated gas: $0.02 USD
- Service fee (30%): $0.006 USD
- Base fee: $0.05 USD
- **Total: ~$0.076 USDC**

---

## Tool Usage Examples

### Example 1: Compile a Contract

```javascript
const result = await client.callTool({
  name: "compile_solidity",
  arguments: {
    sources: {
      "MyContract.sol": {
        content: `// Your Solidity code here`
      }
    },
    version: "v0.8.20+commit.a1b79de6",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "paris"
    }
  }
});
```

### Example 2: Run Security Analysis

```javascript
const result = await client.callTool({
  name: "analyze_with_slither",
  arguments: {
    sources: {
      "Token.sol": {
        content: `// Your token contract code`
      }
    }
  }
});
```

### Example 3: Deploy to Single Network

```javascript
const result = await client.callTool({
  name: "compile_and_deploy",
  arguments: {
    sources: {
      "Counter.sol": {
        content: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Counter {
    uint256 public count;

    function increment() public {
        count += 1;
    }
}
        `
      }
    },
    contractName: "Counter",
    contractFile: "Counter.sol",
    network: "base-sepolia",
    constructorArgs: [],
    postDeploymentCall: {
      methodName: "increment",
      methodArgs: []
    }
  }
});
```

### Example 4: Deploy to Multiple Networks

```javascript
const result = await client.callTool({
  name: "compile_and_deploy_multi_network",
  arguments: {
    sources: {
      "NFT.sol": {
        content: `// Your NFT contract`
      }
    },
    contractName: "MyNFT",
    contractFile: "NFT.sol",
    networks: ["base-sepolia", "sepolia"],
    constructorArgs: ["MyNFT", "MNFT"],
    postDeploymentCall: {
      methodName: "mint",
      methodArgs: ["0xYourAddress", 1]
    }
  }
});
```

---

## Error Handling

The client automatically handles common errors:

- **Insufficient USDC**: You'll receive a clear error if you don't have enough USDC
- **Payment Rejection**: If payment fails, no charge is made
- **Compilation Errors**: Detailed error messages help you fix code issues
- **Deployment Failures**: Partial deployments are reported with detailed status

### Common Errors

**Compilation Errors:**
```json
{
  "errors": [
    {
      "severity": "error",
      "message": "ParserError: Expected ';' but got 'identifier'",
      "formattedMessage": "ParserError: Expected ';' but got 'identifier'\n --> MyContract.sol:5:9:\n  |\n5 |     uint x\n  |         ^"
    }
  ]
}
```

**Payment Errors:**
```json
{
  "error": "Insufficient USDC balance. Required: 0.01 USDC, Available: 0.005 USDC"
}
```

**Deployment Errors:**
```json
{
  "success": false,
  "error": "Contract deployment failed: execution reverted",
  "transactionHash": "0x..."
}
```

---

## Security & Privacy

✅ **You control your keys**: Your private keys never leave your machine
✅ **Gasless signatures**: Payment authorizations use EIP-3009 (no gas for approval)
✅ **On-chain verification**: All payments are verified on-chain before service
✅ **No prepayment**: Pay only when you use tools
✅ **Transparent pricing**: Costs shown before payment

---

## FAQ

**Q: What happens if my deployment fails?**
A: The payment is still consumed (gas was used), but you'll receive detailed error information to fix the issue.

**Q: Can I get a refund?**
A: No, payments are final once services are provided. For compilation/analysis, the service is instant. For deployments, gas costs are incurred.

**Q: Which Solidity versions are supported?**
A: Default is v0.8.35+commit.47b9dedd. The Remix compiler supports multiple Solidity versions - specify your desired version using the `version` parameter.

**Q: Is my code stored on the server?**
A: No. Code is processed in-memory and not stored. Deployment artifacts may be temporarily cached but are not persisted.

**Q: How accurate is gas estimation?**
A: We use a 120% buffer on gas estimation to ensure transactions succeed. Actual costs may be lower.

**Q: Can I use this in production?**
A: Not yet. The server is currently testnet-only. Mainnet support will be announced soon.

**Q: Is the MCP server responsible for the smart contract code I deploy?**
A: No. The MCP server is a deployment service only. You are solely responsible for the smart contract code you write and deploy. The server does not audit, verify, or take responsibility for the functionality, security, or consequences of your deployed contracts. Always audit your code and use security analysis tools before deployment.

### Troubleshooting

**"Insufficient USDC balance"**
- Check your wallet has USDC: `https://sepolia.basescan.org/address/YOUR_ADDRESS`
- Make sure you're checking the USDC token balance, not ETH
- Base Sepolia USDC contract: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

**"Insufficient gas"**
- Your wallet needs Base Sepolia ETH for gas when settling payments

**"Payment settlement failed"**
- Ensure you have both USDC (for payment) and ETH (for gas)
- Check network connectivity
- Verify you're on Base Sepolia testnet

---

## Network Details

- **Network**: Base Sepolia Testnet
- **Chain ID**: 84532
- **USDC Contract**: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- **RPC**: `https://sepolia.base.org`

---

## Support

For issues, questions, or feature requests:
- **GitHub**: [github.com/remix-project-org/x402](https://github.com/remix-project-org/x402)
- **Documentation**:
  - [README.md](README.md) - Project overview
  - [HTTP_API_REFERENCE.md](HTTP_API_REFERENCE.md) - HTTP REST endpoints
  - [CLAUDE_SELF_MANAGED_WALLET.md](CLAUDE_SELF_MANAGED_WALLET.md) - Connect to Claude Desktop/Code
  - [CLAUDE_AGENTIC_WALLET_GUIDE.md](CLAUDE_AGENTIC_WALLET_GUIDE.md) - Coinbase wallet setup
- **Bazaar**: [agentic.market](https://agentic.market) - Discover and validate x402 services

---

## Testnet Testing Period

We're currently in a **testnet evaluation phase**. During this period:
- ✅ All tools available on Base Sepolia testnet
- ✅ Free testnet USDC from faucets
- ✅ Test and provide feedback
- ⏳ Mainnet launch coming soon

Your feedback helps us improve! Report issues or suggest features on GitHub.

---

**Happy Building! 🧪**

Need help? Open an issue on GitHub or check the main README.md for more technical details.
