# HTTP x402 Endpoints with Coinbase Agentic Wallet CLI

This guide shows how to use the HTTP x402 endpoints for Solidity compilation and security analysis using the **Coinbase Agentic Wallet CLI** for payments.

## Overview

The x402 protocol enables pay-per-use API access with on-chain payments. This integration combines:
- **HTTP x402 Server**: Provides Solidity compilation and security analysis endpoints
- **Coinbase Agentic Wallet CLI**: Handles payments via USDC on Base network
- **Facilitator Service**: Manages payment settlement (you don't pay gas fees!)

## Available Services

### POST /compile
Compile Solidity smart contracts
- **Price**: 0.01 USDC
- **Endpoint**: `https://api.remix.live/mcp/x402-http/compile`

### POST /analyze
Run Slither security analysis on smart contracts
- **Price**: 0.02 USDC
- **Endpoint**: `https://api.remix.live/mcp/x402-http/analyze`

## Quick Start

### 1. Setup Wallet

```bash
# Install and authenticate
npx awal status
```

If not authenticated, follow the prompts to set up your wallet.

### 2. Fund with USDC

Get your wallet address and send USDC on Base (testnet or mainnet).

### 3. Make Your First Request

Try the `awal x402 pay` command to compile a simple contract:

```bash
npx awal x402 pay "https://api.remix.live/mcp/x402-http/compile" \
  --method POST \
  --data '{
    "sources": {
      "Test.sol": {
        "content": "pragma solidity ^0.8.0; contract Test { uint256 public value = 42; }"
      }
    },
    "version": "v0.8.35+commit.47b9dedd"
  }'
```

**That's it!** The `awal x402 pay` command handles all payment flow automatically:
- Detects 402 Payment Required
- Signs payment (gasless - no gas fees for you!)
- Retries request with payment proof
- Returns the result

### 4. Optional: Install Skills for AI Agent Integration

For automated AI agent usage, install the skills package:

```bash
npx skills add coinbase/agentic-wallet-skills
```

This enables AI agents like Claude to automatically handle x402 payments.

## Using Agentic Wallet CLI with x402 Services

### Method 1: AI Agent Integration (Recommended)

#### Setup Claude Desktop

Add to your Claude Desktop MCP configuration:

```json
{
  "mcpServers": {
    "agentic-wallet": {
      "command": "npx",
      "args": ["-y", "@coinbase/agentic-wallet-mcp"]
    }
  }
}
```

#### Example Prompts

**Compile:**
```
Compile this Solidity contract using https://api.remix.live/mcp/x402-http/compile

pragma solidity ^0.8.0;
contract SimpleStorage { uint256 public value; }
```

**Analyze:**
```
Analyze this contract using https://api.remix.live/mcp/x402-http/analyze

pragma solidity ^0.8.0;
contract Vault {
    mapping(address => uint256) public balances;
    function withdraw() public {
        uint256 amount = balances[msg.sender];
        msg.sender.call{value: amount}("");
        balances[msg.sender] = 0;
    }
}
```

Claude automatically handles authentication, payment, and returns results.

### Method 2: Direct CLI Usage

**Compile:**

```bash
npx awal x402 pay "https://api.remix.live/mcp/x402-http/compile" \
  --method POST \
  --data '{
    "sources": {
      "SimpleStorage.sol": {
        "content": "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\n\ncontract SimpleStorage {\n    uint256 public value;\n    \n    function set(uint256 _value) public {\n        value = _value;\n    }\n    \n    function get() public view returns (uint256) {\n        return value;\n    }\n}"
      }
    },
    "version": "v0.8.35+commit.47b9dedd"
  }'
```

**Analyze:**

```bash
npx awal x402 pay "https://api.remix.live/mcp/x402-http/analyze" \
  --method POST \
  --data '{
    "sources": {
      "VulnerableContract.sol": {
        "content": "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\n\ncontract VulnerableContract {\n    mapping(address => uint256) public balances;\n    \n    function deposit() public payable {\n        balances[msg.sender] += msg.value;\n    }\n    \n    function withdraw() public {\n        uint256 amount = balances[msg.sender];\n        (bool success, ) = msg.sender.call{value: amount}(\"\");\n        require(success, \"Transfer failed\");\n        balances[msg.sender] = 0;\n    }\n}"
      }
    },
    "version": "v0.8.35+commit.47b9dedd",
    "excludeInformational": false
  }'
```

## Key Information

### Pricing
| Service | Cost | Gas Fees |
|---------|------|----------|
| Compile | 0.01 USDC | $0 (facilitator pays) |
| Analyze | 0.02 USDC | $0 (facilitator pays) |

### Networks
- **Base Mainnet**: Chain ID `eip155:8453`
- **Base Sepolia**: Chain ID `eip155:84532`

### Spending Limits

Configure spending caps for safety:

```bash
npx awal config --tx-limit 0.10      # Per transaction
npx awal config --session-limit 1.00 # Per session
```

## Resources

- **Agentic Wallet Docs**: https://docs.cdp.coinbase.com/agentic-wallet/cli/welcome
- **Service Marketplace**: https://agentic.market/services/api-remix-live
- **Endpoint Details**: [HTTP_X402_ENDPOINTS.md](HTTP_X402_ENDPOINTS.md)
- **Programmatic Usage**: [HTTP_X402_USAGE.md](HTTP_X402_USAGE.md)
