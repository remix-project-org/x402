# Remix x402 MCP Server

Welcome to the Remix x402 MCP Server! This is a **public testnet server** providing Solidity development tools powered by the x402 payment protocol. Pay for what you use with USDC on Base Sepolia testnet.

> **🧪 Testnet Only**: This server currently operates on **Base Sepolia testnet only** for testing and evaluation. Mainnet support coming soon!

## What is x402?

x402 is a micropayment protocol that enables pay-per-use services. You pay small amounts of USDC for each tool usage, and payments are settled on-chain using gasless signatures (EIP-3009).

## Available Tools

### 1. Solidity Compilation
**Tool:** `compile_solidity`
**Price:** 0.01 USDC
**Description:** Compile your Solidity smart contracts using the Remix compiler.

**What you get:**
- Full compilation output with bytecode and ABI
- Multiple Solidity versions supported (default: v0.8.26)
- Optimizer settings configurable
- Detailed error and warning messages

### 2. Security Analysis with Slither
**Tool:** `analyze_with_slither`
**Price:** 0.02 USDC
**Description:** Run static security analysis on your Solidity contracts using Slither.

**What you get:**
- Comprehensive security vulnerability detection
- Best practice recommendations
- Detailed findings with severity levels
- Line-by-line issue reporting

### 3. Single Network Deployment
**Tool:** `compile_and_deploy`
**Price:** Dynamic (gas cost + 30% fee + 0.05 USDC base)
**Description:** Deploy your smart contracts without sharing your private keys. The server deploys using its own wallet and you pay for the gas + service fee.

**What you get:**
- Automatic gas estimation before payment
- Contract compilation and deployment
- Optional post-deployment method calls
- Deployment receipt with contract address and transaction details
- **Network**: Base Sepolia testnet

### 4. Multi-Network Deployment
**Tool:** `compile_and_deploy_multi_network`
**Price:** Dynamic (total gas across networks + 30% fee + 0.05 USDC base + 10% multi-network buffer)
**Description:** Deploy the same contract to multiple networks simultaneously.

**What you get:**
- Compile once, deploy everywhere
- Parallel deployment to multiple networks
- Per-network deployment status and addresses
- Optional post-deployment calls on each network
- **Networks**: Base Sepolia and Sepolia (Ethereum testnet)

## Getting Started

### Prerequisites

1. **USDC Balance**: You need USDC tokens on Base Sepolia testnet
   - Get Base Sepolia USDC from faucets (see "Getting USDC" section below)
   - No real money required - testnet only!

2. **Wallet**: A wallet with a private key to sign payment authorizations

### Quick Start with MCP Client

```javascript
import { createMCPClient } from './src/lib/index.js';

// Connect to the public server
const serverUrl = 'https://mcp.api.remix.live/x402/mcp';
const { client, transport, wallet } = createMCPClient(serverUrl, {
  name: 'Your-App-Name',
  version: '1.0.0'
});

await client.connect(transport);

// Use a tool - payments are handled automatically
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
    },
    contractName: "HelloWorld",
    contractFile: "HelloWorld.sol"
  }
});

console.log(JSON.parse(result.content[0].text));
```

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
    contractName: "MyContract",
    contractFile: "MyContract.sol",
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
    },
    contractName: "Token",
    contractFile: "Token.sol"
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
    // Optional: Call a method after deployment
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

## Payment Flow

1. **You call a tool** - The MCP client sends your request to the server
2. **Server estimates cost** - For deployment tools, server calculates gas costs
3. **Payment required** - Server responds with payment requirements
4. **Client creates authorization** - Your wallet signs a USDC transfer authorization (gasless signature)
5. **Client settles payment** - Your wallet submits the authorization on-chain (you pay gas for this)
6. **Server verifies** - Server confirms payment was settled on-chain
7. **Tool execution** - Server executes the tool and returns results
8. **You receive output** - Compilation, analysis, or deployment results

## Pricing Details

### Fixed Price Tools
- **Compilation**: 0.01 USDC per compilation
- **Security Analysis**: 0.02 USDC per analysis

### Dynamic Price Tools (Deployment)

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

## Supported Networks (Testnet Only)

Currently available networks:
- **Base Sepolia**: Primary network for single deployments
- **Sepolia**: Ethereum testnet (for multi-network deployments)

> **Note**: All networks are testnets. Mainnet support will be announced when available.

## Error Handling

The client automatically handles common errors:

- **Insufficient USDC**: You'll receive a clear error if you don't have enough USDC
- **Payment Rejection**: If payment fails, no charge is made
- **Compilation Errors**: Detailed error messages help you fix code issues
- **Deployment Failures**: Partial deployments are reported with detailed status

## Security & Privacy

✅ **You control your keys**: Your private keys never leave your machine
✅ **Gasless signatures**: Payment authorizations use EIP-3009 (no gas for approval)
✅ **On-chain verification**: All payments are verified on-chain before service
✅ **No prepayment**: Pay only when you use tools
✅ **Transparent pricing**: Costs shown before payment

## Rate Limits & Fair Use

- No rate limits currently enforced
- Fair use policy: Don't abuse the service with spam requests
- Heavy users: Contact us for enterprise pricing

## Support & Community

- **GitHub**: [github.com/remix-project-org/x402](https://github.com/remix-project-org/x402)
- **Issues**: Report bugs or request features on GitHub
- **Documentation**: Full technical docs in the repository

## Getting USDC on Base Sepolia

For testing:
1. Get Sepolia ETH from a faucet
2. Bridge to Base Sepolia using the official bridge
3. Swap for USDC on Base Sepolia testnet
4. Or use Base Sepolia faucets that provide USDC directly

## FAQ

**Q: What happens if my deployment fails?**
A: The payment is still consumed (gas was used), but you'll receive detailed error information to fix the issue.

**Q: Can I get a refund?**
A: No, payments are final once services are provided. For compilation/analysis, the service is instant. For deployments, gas costs are incurred.

**Q: Which Solidity versions are supported?**
A: Default is v0.8.26. The Remix compiler supports multiple versions - specify your version in the settings.

**Q: Is my code stored on the server?**
A: No. Code is processed in-memory and not stored. Deployment artifacts may be temporarily cached but are not persisted.

**Q: How accurate is gas estimation?**
A: We use a 120% buffer on gas estimation to ensure transactions succeed. Actual costs may be lower.

**Q: Can I use this in production?**
A: Not yet. The server is currently testnet-only. Mainnet support will be announced soon.

## Testnet Testing Period

We're currently in a **testnet evaluation phase**. During this period:
- ✅ All tools available on Base Sepolia testnet
- ✅ Free testnet USDC from faucets
- ✅ Test and provide feedback
- ⏳ Mainnet launch coming soon

Your feedback helps us improve! Report issues or suggest features on GitHub.

## Next Steps

1. Get some USDC on Base Sepolia (see guide above)
2. Clone the example client code
3. Try compiling a simple contract
4. Explore security analysis
5. Deploy your first testnet contract!
6. Give us feedback on GitHub

---

**Happy Building on Testnet! 🧪**

Need help? Open an issue on GitHub or check the main README.md for more technical details.
