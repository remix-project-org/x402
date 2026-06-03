# Connecting to Claude Desktop

This guide shows how to connect the Remix X402 MCP server to Claude Desktop with automatic x402 payment support.

## Prerequisites

1. **Claude Desktop** - Download from [claude.ai/download](https://claude.ai/download)
2. **Node.js 18+** installed
3. **Wallet with Base Sepolia funds:**
   - USDC: 1-5 USDC for services, [USDC Faucet](https://faucet.circle.com/)
   - ETH: ~0.01 ETH for gas, [Base Sepolia Faucet](https://www.coinbase.com/faucets/base-sepolia-faucet)

## Setup Instructions

### Step 1: Clone the Repository

First, clone this x402 repository to your local machine:

```bash
# Clone the repository
git clone https://github.com/remix-project-org/x402.git

# Navigate into the directory
cd x402
```

The `claude-desktop-client.mjs` script is already included in the repository.

### Step 2: Install Dependencies

Install the required packages:

```bash
yarn install
```

This installs the Ampersend SDK and other packages needed for x402 payment handling.

### Step 3: Get the Absolute Path

Get the absolute path to `claude-desktop-client.mjs`.

You'll need this path for the next step.

### Step 4: Configure Claude Desktop

**Open the config editor:**

1. Open Claude Desktop
2. Click the **MCP icon** (puzzle piece) in bottom-left corner, or go to **Settings → Developer**
3. Click **"Edit Config"**

**Add this configuration:**

```json
{
  "mcpServers": {
    "remix-x402": {
      "command": "node",
      "args": [
        "/PASTE/YOUR/PATH/HERE/claude-desktop-client.mjs"
      ],
      "env": {
        "EVM_PRIVATE_KEY": "0xyour_private_key_here"
      }
    }
  }
}
```

**Replace:**
- Paste the path from Step 3 into `args` (replace `/PASTE/YOUR/PATH/HERE/claude-desktop-client.mjs`)
- Replace `0xyour_private_key_here` with your Base Sepolia wallet private key (must start with `0x`)

**Your wallet needs:**
- **USDC** for payments (1-5 USDC recommended)
- **ETH** for gas (~0.01 ETH recommended)

**Save and close the editor.**

### Step 5: Restart Claude Desktop

1. Quit completely: `Cmd+Q` (macOS) or File → Exit (Windows/Linux)
2. Relaunch Claude Desktop
3. Click the **MCP icon** (puzzle piece) - look for **"remix-x402"** with ✅ green checkmark
4. OR Go to Settings -> Developer - look for **"remix-x402"** with `running` badge 

If you see ❌ red X or `failing` badge, check the Troubleshooting section below.

### Step 6: Test It

In Claude Desktop, start a new conversation and try:

```
Can you list the available Remix X402 tools?
```

or simply:

```
What tools do you have access to?
```

You should see 4 tools available:
- **`compile_solidity`** - Compile Solidity contracts (0.01 USDC)
- **`analyze_with_slither`** - Security analysis with Slither (0.02 USDC)
- **`compile_and_deploy`** - Deploy to single network (dynamic gas-based pricing)
- **`compile_and_deploy_multi_network`** - Deploy to multiple networks (dynamic gas-based pricing)

**Try a simple compilation:**
```
Can you compile this Solidity contract for me?

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract HelloWorld {
    string public message = "Hello, World!";
}
```

Claude will automatically use the `compile_solidity` tool and handle the x402 payment (0.01 USDC) for you!

## How It Works

```
Claude Desktop (stdio) ←→ Client Script ←→ Remix X402 Server (HTTP+x402)
                           ├─ Protocol conversion (stdio ↔ HTTP)
                           ├─ Automatic x402 payments
                           ├─ Transaction signing
                           └─ Payment settlement
```

The `claude-desktop-client.mjs` script:
1. **Bridges transports:** Converts between Claude Desktop's stdio and the server's HTTP transport
2. **Handles payments automatically:** When a tool requires payment, the Ampersend SDK Treasurer:
   - Receives payment requirements from the server
   - Creates and signs an EIP-3009 USDC authorization
   - Settles the payment on-chain (Base Sepolia)
   - Retries the tool call with payment proof
3. **Manages your wallet:** Uses your `EVM_PRIVATE_KEY` to sign transactions locally (never sent to server)
4. **Forwards responses:** Converts server responses back to Claude Desktop's JSON-RPC format

**Payment Flow:**
1. You ask Claude to use a tool (e.g., compile Solidity)
2. Server responds with payment requirement (e.g., 0.01 USDC)
3. Client automatically signs and settles USDC payment on-chain
4. Client retries tool call with proof of payment
5. Server verifies payment on-chain and executes tool
6. Results returned to Claude Desktop

All of this happens automatically - you just use Claude normally!

## Available Tools & Pricing

| Tool | Description | Cost |
|------|-------------|------|
| **compile_solidity** | Compile Solidity contracts with the Remix compiler | 0.01 USDC |
| **analyze_with_slither** | Security analysis with Slither static analyzer | 0.02 USDC |
| **compile_and_deploy** | Compile and deploy to a single network (delegated deployment) | Dynamic* |
| **compile_and_deploy_multi_network** | Compile once, deploy to multiple networks | Dynamic* |

*Dynamic pricing = Gas costs + 0.0001 USDC service fee per deployment

See [USAGE.md](USAGE.md) for detailed tool documentation and examples.

## Security Notes

✅ **Your private key stays local:**
- The private key is only used by the client script running on your machine
- It never leaves your computer
- It's only used to sign USDC payment authorizations

✅ **Payments are on-chain:**
- All payments are verifiable on Base Sepolia blockchain
- Server verifies settlements before providing services

✅ **Test with small amounts:**
- Start with small amounts of testnet USDC
- Test compilations cost only 0.01 USDC

## What's Next?

Once connected, you can:
- **Compile Solidity contracts** by simply pasting code
- **Run security analysis** with Slither
- **Deploy to testnets** without managing deployment scripts
- **Multi-chain deployments** to several networks at once

All with automatic x402 micropayments handled seamlessly!

## Additional Resources

- **Usage Guide:** [USAGE.md](USAGE.md) - Detailed examples and workflows
- **API Reference:** [API_REFERENCE.md](API_REFERENCE.md) - Complete tool specifications
- **Project README:** [README.md](README.md) - Architecture and implementation details
- **Issues & Support:** [GitHub Issues](https://github.com/remix-project-org/x402/issues)
