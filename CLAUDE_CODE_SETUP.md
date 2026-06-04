# Connecting Remix X402 to Claude Code CLI

This guide shows how to connect the Remix X402 MCP server to Claude Code CLI with automatic x402 payment support.

## Quick Start

```bash
# 1. Clone and install dependencies
git clone https://github.com/remix-project-org/x402.git
cd x402
yarn install

# 2. Add the MCP server with stdio bridge (handles x402 payments)
claude mcp add --transport stdio --scope local Remix_x402 \
  --env EVM_PRIVATE_KEY=0xyour_private_key_here \
  -- node $(pwd)/claude-code-client.mjs

# 3. Verify connection
claude mcp list

# 4. Start using it
claude
```

## Prerequisites

1. **Claude Code CLI** - Install from [claude.ai/claude-code](https://claude.ai/claude-code)
2. **Node.js 18+** installed
3. **Wallet with Base Sepolia funds:**
   - USDC: 1-5 USDC for payments ([USDC Faucet](https://faucet.circle.com/))
   - ETH: ~0.01 ETH for gas ([Base Sepolia Faucet](https://www.coinbase.com/faucets/base-sepolia-faucet))

## How It Works

```
Claude Code CLI ←→ Bridge Client (stdio) ←→ Remix X402 Server (HTTP + x402)
                   (claude-code-client.mjs)   (mcp.api.remix.live)
                   └─ Uses your wallet to make x402 payments automatically
```

The bridge client handles x402 micropayments automatically by:
1. Receiving requests from Claude Code via stdio
2. Creating x402 payments using your `EVM_PRIVATE_KEY`
3. Forwarding requests to the Remix X402 server
4. Returning compiled bytecode/ABI back to Claude Code

**All payments happen automatically - you just use Claude Code normally!**

## Available Tools & Pricing

| Tool | Description | Cost |
|------|-------------|------|
| **compile_solidity** | Compile Solidity contracts with the Remix compiler | 0.01 USDC |
| **analyze_with_slither** | Security analysis with Slither static analyzer | 0.02 USDC |
| **compile_and_deploy** | Compile and deploy to a single network (delegated deployment) | Dynamic* |
| **compile_and_deploy_multi_network** | Compile once, deploy to multiple networks | Dynamic* |

*Dynamic pricing = Gas costs + 0.0001 USDC service fee per deployment

## Setup Instructions

### 1. Clone and Install

```bash
git clone https://github.com/remix-project-org/x402.git
cd x402
yarn install
```

### 2. Add MCP Server to Claude Code

```bash
# Navigate to the x402 directory
cd /path/to/x402

# Add the MCP server with stdio transport
claude mcp add --transport stdio --scope local Remix_x402 \
  --env EVM_PRIVATE_KEY=0xyour_private_key_here \
  -- node $(pwd)/claude-code-client.mjs
```

**Replace** `0xyour_private_key_here` with your Base Sepolia wallet private key (must start with `0x`).

**Command options:**
- `--transport stdio`: Uses stdio for communication
- `--scope local`: Project-specific (use `--scope user` for global access)
- `--env EVM_PRIVATE_KEY=...`: Sets your wallet private key

### 3. Verify Connection

```bash
claude mcp list
```

Should show:
```
Remix_x402: node /path/to/x402/claude-code-client.mjs (stdio) - ✓ Connected
```

### 4. Test with a Compilation

Start Claude Code and try:

```
Can you compile this Solidity contract for me?

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract HelloWorld {
    string public message = "Hello, World!";
}
```

The compilation will cost 0.01 USDC, paid automatically from your wallet.

## Managing MCP Servers

```bash
# List all configured servers
claude mcp list

# Get details about a specific server
claude mcp get Remix_x402

# Remove a server
claude mcp remove Remix_x402 -s local

# Update server configuration (remove and re-add)
claude mcp remove Remix_x402 -s local
claude mcp add --transport stdio --scope local Remix_x402 \
  --env EVM_PRIVATE_KEY=0xyour_new_key \
  -- node $(pwd)/claude-code-client.mjs
```

## Troubleshooting

### Connection Issues

**Check server status:**
```bash
claude mcp list  # Should show "✓ Connected"
```

**Verify private key:**
```bash
claude mcp get Remix_x402
```
- Key must start with `0x`
- Should be 66 characters (0x + 64 hex chars)

### Payment Issues

**"Insufficient USDC balance":**
- Get USDC from [faucet.circle.com](https://faucet.circle.com/)
- Check balance on [Base Sepolia Explorer](https://sepolia.basescan.org/)

**"Insufficient gas":**
- Get ETH from [Base Sepolia Faucet](https://www.coinbase.com/faucets/base-sepolia-faucet)

### Module/Build Issues

**"Cannot find module" error:**
```bash
yarn install
ls -la node_modules/@ampersend_ai/ampersend-sdk
```

## Security Notes

- Your private key stays local and never leaves your computer
- It's only used to sign USDC payment authorizations
- All payments are verifiable on Base Sepolia blockchain
- Start with small amounts of testnet USDC (compilations cost 0.01 USDC)

## Additional Resources

- [USAGE.md](USAGE.md) - Detailed examples and workflows
- [API_REFERENCE.md](API_REFERENCE.md) - Complete tool specifications
- [CLAUDE_DESKTOP_SETUP.md](CLAUDE_DESKTOP_SETUP.md) - Setup for Claude Desktop GUI
- [README.md](README.md) - Architecture and implementation details
- [GitHub Issues](https://github.com/remix-project-org/x402/issues) - Support
