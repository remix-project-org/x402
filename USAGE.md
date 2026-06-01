# Remix x402 MCP Server

Welcome to the Remix x402 MCP Server! This is a **public testnet server** providing Solidity development tools powered by the x402 payment protocol. Pay for what you use with USDC on Base Sepolia testnet.

> **🧪 Testnet Only**: This server currently operates on **Base Sepolia testnet only** for testing and evaluation. Mainnet support coming soon!

## What is x402?

x402 is a micropayment protocol that enables pay-per-use services. You pay small amounts of USDC for each tool usage, and payments are settled on-chain using gasless signatures (EIP-3009).

## Available Tools

> 📚 **For complete API specifications, input/output schemas, and advanced examples, see [API_REFERENCE.md](API_REFERENCE.md)**

### 1. Solidity Compilation
**Tool:** `compile_solidity` <br/>
**Price:** 0.01 USDC<br/>
**Description:** Compile your Solidity smart contracts using the Remix compiler.<br/>

**What you get:**
- Full compilation output with bytecode and ABI
- Multiple Solidity versions supported (default: v0.8.35)
- Optimizer settings configurable
- Detailed error and warning messages

### 2. Security Analysis with Slither
**Tool:** `analyze_with_slither`<br/>
**Price:** 0.02 USDC<br/>
**Description:** Run static security analysis on your Solidity contracts using Slither.<br/>

**What you get:**
- Comprehensive security vulnerability detection
- Best practice recommendations
- Detailed findings with severity levels
- Line-by-line issue reporting

### 3. Single Network Deployment
**Tool:** `compile_and_deploy`<br/>
**Price:** Dynamic (gas cost + 30% fee + 0.05 USDC base)<br/>
**Description:** Deploy your smart contracts without sharing your private keys. The server deploys using its own wallet and you pay for the gas + service fee.<br/>

**What you get:**
- Automatic gas estimation before payment
- Contract compilation and deployment
- Optional post-deployment method calls
- Deployment receipt with contract address and transaction details
- **Network**: Base Sepolia testnet

### 4. Multi-Network Deployment
**Tool:** `compile_and_deploy_multi_network`<br/>
**Price:** Dynamic (total gas across networks + 30% fee + 0.05 USDC base + 10% multi-network buffer)<br/>
**Description:** Deploy the same contract to multiple networks simultaneously.<br/>

**What you get:**
- Compile once, deploy everywhere
- Parallel deployment to multiple networks
- Per-network deployment status and addresses
- Optional post-deployment calls on each network
- **Networks**: Base Sepolia and Sepolia (Ethereum testnet)

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

### How x402 Payments Work

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

### Quick Start Script

Here's a complete working example:

```javascript
import { createMCPClient } from './src/lib/index.js';

async function main() {
  // Create client (reads PRIVATE_KEY from .env)
  const serverUrl = 'https://mcp.api.remix.live/x402/mcp';
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

## Tool Usage Examples

> 💡 **Tip:** These are basic examples. For detailed input/output specifications and error handling, see [API_REFERENCE.md](API_REFERENCE.md)

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

✅ **You control your keys**: Your private keys never leave your machine<br/>
✅ **Gasless signatures**: Payment authorizations use EIP-3009 (no gas for approval)<br/>
✅ **On-chain verification**: All payments are verified on-chain before service<br/>
✅ **No prepayment**: Pay only when you use tools<br/>
✅ **Transparent pricing**: Costs shown before payment<br/>

## Rate Limits & Fair Use

- No rate limits currently enforced
- Fair use policy: Don't abuse the service with spam requests
- Heavy users: Contact us for enterprise pricing

## Support & Community

- **GitHub**: [github.com/remix-project-org/x402](https://github.com/remix-project-org/x402)
- **Issues**: Report bugs or request features on GitHub
- **Documentation**:
  - [API Reference](API_REFERENCE.md) - Complete API documentation
  - [README.md](README.md) - Technical implementation details

## FAQ

**Q: What happens if my deployment fails?**<br/>
A: The payment is still consumed (gas was used), but you'll receive detailed error information to fix the issue.

**Q: Can I get a refund?**<br/>
A: No, payments are final once services are provided. For compilation/analysis, the service is instant. For deployments, gas costs are incurred.

**Q: Which Solidity versions are supported?**<br/>
A: Default is v0.8.35. The Remix compiler supports multiple versions - specify your version in the settings.

**Q: Is my code stored on the server?**<br/>
A: No. Code is processed in-memory and not stored. Deployment artifacts may be temporarily cached but are not persisted.

**Q: How accurate is gas estimation?**<br/>
A: We use a 120% buffer on gas estimation to ensure transactions succeed. Actual costs may be lower.

**Q: Can I use this in production?**<br/>
A: Not yet. The server is currently testnet-only. Mainnet support will be announced soon.

**Q: Is the MCP server responsible for the smart contract code I deploy?**<br/>
A: No. The MCP server is a deployment service only. You are solely responsible for the smart contract code you write and deploy. The server does not audit, verify, or take responsibility for the functionality, security, or consequences of your deployed contracts. Always audit your code and use security analysis tools before deployment.

## Testnet Testing Period

We're currently in a **testnet evaluation phase**. During this period:
- ✅ All tools available on Base Sepolia testnet
- ✅ Free testnet USDC from faucets
- ✅ Test and provide feedback
- ⏳ Mainnet launch coming soon

Your feedback helps us improve! Report issues or suggest features on GitHub.

## Troubleshooting

### "Insufficient USDC balance"
- Check your wallet has USDC: `https://sepolia.basescan.org/address/YOUR_ADDRESS`
- Make sure you're checking the USDC token balance, not ETH
- Base Sepolia USDC contract: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

### "Insufficient gas"
- Your wallet needs Base Sepolia ETH for gas when settling payments

### "Payment settlement failed"
- Ensure you have both USDC (for payment) and ETH (for gas)
- Check network connectivity
- Verify you're on Base Sepolia testnet

---

**Happy Building! 🧪**

Need help? Open an issue on GitHub or check the main README.md for more technical details.
