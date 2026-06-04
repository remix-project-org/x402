# Connecting Remix X402 to Claude

This guide shows how to connect the Remix X402 MCP server to **both Claude Desktop and Claude Code CLI** with automatic x402 payment support.

**Choose your platform:**
- [Claude Desktop Setup](#claude-desktop-setup) - GUI application
- [Claude Code CLI Setup](#claude-code-cli-setup) - Terminal interface

Both use the same unified `claude-client.mjs` bridge script.

---

## Prerequisites

### 1. Install Required Software

**Claude Desktop or Claude Code CLI:**
- **Claude Desktop** - Download from [claude.ai/download](https://claude.ai/download)
- **Claude Code CLI** - Install from [claude.ai/claude-code](https://claude.ai/claude-code)

**Node.js 18+:**
- Check if installed: `node --version`
- Download from [nodejs.org](https://nodejs.org/) if needed

### 2. Get a Base Sepolia Wallet

You'll need a wallet with testnet funds:

**USDC (for payments):**
- Amount: 1-5 USDC recommended
- Get from [USDC Faucet](https://faucet.circle.com/)

**ETH (for gas):**
- Amount: ~0.01 ETH recommended
- Get from [Base Sepolia Faucet](https://www.coinbase.com/faucets/base-sepolia-faucet)

**Important:** You'll need your wallet's private key (starts with `0x`). Keep it secure!

---

## Installation

### Step 1: Clone the Repository

```bash
git clone https://github.com/remix-project-org/x402.git
cd x402
```

### Step 2: Install Dependencies

```bash
yarn install
```

This installs the Ampersend SDK and other packages needed for x402 payment handling.

### Step 3: Verify the Client Script

Check that the unified client script exists:

```bash
ls -la claude-client.mjs
```

You should see the executable file. Now proceed to your platform-specific setup below.

---

## How It Works

```
Claude Desktop/Code (stdio) ←→ Bridge Client ←→ Remix X402 Server (HTTP + x402)
                                (claude-client.mjs)  (mcp.api.remix.live)
                                └─ Handles x402 payments automatically
```

The unified `claude-client.mjs` script:
- Bridges stdio (Claude) ↔ HTTP (Remix server)
- Automatically handles x402 micropayments using your wallet
- Signs transactions locally with your `EVM_PRIVATE_KEY`
- Works identically for both Desktop and CLI

**All payments happen automatically - you just use Claude normally!**

---

## Available Tools & Pricing

| Tool | Description | Cost |
|------|-------------|------|
| **compile_solidity** | Compile Solidity contracts | 0.01 USDC |
| **analyze_with_slither** | Security analysis with Slither | 0.02 USDC |
| **compile_and_deploy** | Compile and deploy to single network | Dynamic* |
| **compile_and_deploy_multi_network** | Compile and deploy to multiple networks | Dynamic* |

*Dynamic pricing = Gas costs + 0.0001 USDC service fee per deployment

---

## Claude Desktop Setup

### Step 1: Get Absolute Path

From the `x402` directory, get the absolute path to the client script:

```bash
cd /path/to/x402
echo "$(pwd)/claude-client.mjs"
```

Copy this path for the next step.

### Step 2: Open Claude Desktop Config

1. Open Claude Desktop app
2. Click the **MCP icon** (puzzle piece) in bottom-left, or go to **Settings → Developer**
3. Click **"Edit Config"**

### Step 3: Add Configuration

Add this to your config file:

```json
{
  "mcpServers": {
    "remix-x402": {
      "command": "node",
      "args": [
        "/PASTE/ABSOLUTE/PATH/HERE/claude-client.mjs"
      ],
      "env": {
        "EVM_PRIVATE_KEY": "0xyour_private_key_here"
      }
    }
  }
}
```

**Replace:**
- `/PASTE/ABSOLUTE/PATH/HERE/claude-client.mjs` with the path from Step 1
  - Example: `/Users/yourname/projects/x402/claude-client.mjs` (macOS/Linux)
  - Example: `C:\\Users\\yourname\\projects\\x402\\claude-client.mjs` (Windows)
- `0xyour_private_key_here` with your Base Sepolia wallet private key (must start with `0x`)

**Save the file.**

### Step 4: Restart Claude Desktop

1. Quit completely: `Cmd+Q` (macOS) or File → Exit (Windows/Linux)
2. Relaunch Claude Desktop
3. Check MCP icon - look for **"remix-x402"** with ✅ green checkmark 
or Go to Settings -> Developer - look for **"remix-x402"** with blue `running` badge

If you see ❌ red X or `failed` badge, check [Troubleshooting](#troubleshooting).

### Step 5: Test It

In Claude Desktop, start a new conversation and try:

```
Can you compile this Solidity contract for me?

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract HelloWorld {
    string public message = "Hello, World!";
}
```

Claude will automatically use the `compile_solidity` tool and handle the x402 payment (0.01 USDC) for you!

---

## Claude Code CLI Setup

### Step 1: Navigate to x402 Directory

```bash
cd /path/to/x402
```

### Step 2: Add MCP Server

Run this command to add the Remix X402 server:

```bash
claude mcp add --transport stdio --scope local remix-x402 \
  --env EVM_PRIVATE_KEY=0xyour_private_key_here \
  -- node $(pwd)/claude-client.mjs
```

**Replace** `0xyour_private_key_here` with your Base Sepolia wallet private key (must start with `0x`).

**Command options:**
- `--transport stdio`: Uses stdio for communication
- `--scope local`: Project-specific (use `--scope user` for global access)
- `--env EVM_PRIVATE_KEY=...`: Sets your wallet private key
- `$(pwd)/claude-client.mjs`: Uses absolute path to the client script

### Step 3: Verify Connection

Check that the server was added successfully:

```bash
claude mcp list
```

Should show:
```
Checking MCP server health...

remix-x402: node /path/to/x402/claude-client.mjs (stdio) - ✓ Connected
```

If you see an error, check [Troubleshooting](#troubleshooting).

### Step 4: Test It

Start Claude Code:

```bash
claude
```

Then ask:
```
Can you compile this Solidity contract for me?

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract HelloWorld {
    string public message = "Hello, World!";
}
```

The compilation will cost 0.01 USDC, paid automatically from your wallet!

---

## Managing Configurations

### Claude Desktop

To update your configuration:
1. Go to Settings → Developer → Edit Config
2. Make your changes
3. Save and restart Claude Desktop

### Claude Code CLI

```bash
# List all servers
claude mcp list

# Get server details
claude mcp get remix-x402

# Remove server
claude mcp remove remix-x402 -s local

# Update configuration (remove and re-add)
claude mcp remove remix-x402 -s local
claude mcp add --transport stdio --scope local remix-x402 \
  --env EVM_PRIVATE_KEY=0xyour_new_key \
  -- node $(pwd)/claude-client.mjs
```

---

## Troubleshooting

### Connection Issues

**Claude Desktop - Red X or "failing" badge:**
1. Check config file syntax (must be valid JSON)
2. Verify the absolute path to `claude-client.mjs` is correct
3. Make sure Node.js is installed: `node --version`
4. Check Claude Desktop logs in Developer settings

**Claude Code CLI - Not connecting:**
```bash
# Check server status
claude mcp list  # Should show "✓ Connected"

# Get detailed info
claude mcp get remix-x402
```

**Verify private key format:**
- Key must start with `0x`
- Should be 66 characters total (0x + 64 hex chars)
- Example: `0x1234567890abcdef...` (64 hex chars after 0x)

### Payment Issues

**"Insufficient USDC balance":**
1. Get USDC from [faucet.circle.com](https://faucet.circle.com/)
2. Check your balance: [Base Sepolia Explorer](https://sepolia.basescan.org/)
3. Search for your wallet address to see your USDC balance

**"Insufficient gas":**
1. Get ETH from [Base Sepolia Faucet](https://www.coinbase.com/faucets/base-sepolia-faucet)
2. You need ~0.01 ETH for gas fees

---

## Security Notes

✅ **Your private key stays local:**
- The private key is only used by the client script running on your machine
- It never leaves your computer
- It's only used to sign USDC payment authorizations

✅ **Payments are on-chain:**
- All payments are verifiable on Base Sepolia blockchain
- Server verifies settlements before providing services
- You can view all transactions in a block explorer

✅ **Start small:**
- Test with small amounts of testnet USDC first
- Single compilations cost only 0.01 USDC
- Monitor your spending through blockchain explorers

⚠️ **Keep your private key secure:**
- Never commit it to git
- Never share it with anyone
- Use a dedicated testnet wallet (not your mainnet wallet)

---

## What's Next?

Once connected, you can:

- **Compile Solidity contracts** by simply pasting code
- **Run security analysis** with Slither to find vulnerabilities
- **Deploy to testnets** without writing deployment scripts
- **Multi-chain deployments** to several networks at once

All with automatic x402 micropayments handled seamlessly!

### Example Workflows

**Compile a contract:**
```
Compile this ERC20 token contract for me
```

**Security analysis:**
```
Run Slither analysis on this contract to find security issues
```

**Deploy to testnet:**
```
Deploy this contract to Base Sepolia testnet
```

**Multi-chain deployment:**
```
Deploy this contract to Base Sepolia, Optimism Sepolia, and Arbitrum Sepolia
```

---

## Additional Resources

- [USAGE.md](USAGE.md) - Detailed examples and workflows
- [API_REFERENCE.md](API_REFERENCE.md) - Complete tool specifications
- [README.md](README.md) - Architecture and implementation details
- [GitHub Issues](https://github.com/remix-project-org/x402/issues) - Support
