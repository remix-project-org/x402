# HTTP x402 API Reference

Complete documentation for the HTTP REST endpoints implementing the x402 payment protocol with facilitator-based settlement.

> **📌 Note**: This document covers **HTTP REST endpoints only**. For MCP tools (AI agents), see [MCP_API_REFERENCE.md](MCP_API_REFERENCE.md).

## Table of Contents

- [Overview](#overview)
- [Getting Started](#getting-started)
- [Available Endpoints](#available-endpoints)
  - [POST /compile](#post-compile)
  - [POST /analyze](#post-analyze)
  - [POST /get_audit_checklist](#post-get_audit_checklist)
  - [POST /do_audit](#post-do_audit)
  - [GET /job/:id](#get-jobid)
  - [GET /info](#get-info)
  - [GET /health](#get-health)
- [Payment Flow](#payment-flow)
- [Using @x402/fetch Library](#using-x402fetch-library)
- [Facilitator Service](#facilitator-service)
- [Error Handling](#error-handling)
- [Support](#support)

---

## Overview

The HTTP x402 server provides standard REST endpoints that implement the x402 payment protocol. These endpoints use a **facilitator service** (CDP Facilitator) to handle payment verification and settlement.

### Key Features

- **x402 v2 Protocol**: Full compliance with the latest x402 payment protocol
- **Bazaar Discovery Extension**: Includes complete metadata in both response body and `PAYMENT-REQUIRED` header
- **No Gas Fees for Clients**: The facilitator pays transaction fees
- **On-chain Payment Verification**: Verifies USDC payments on Base before service execution
- **Auto-discoverable**: Indexed on agentic.market for AI agent discovery
- **Async Processing**: Long-running AI audit operations use job polling pattern

### Architecture

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ (1) POST /compile (no payment)
       ▼
┌─────────────────────┐
│  HTTP x402 Server   │
│   (Port 8002)       │
└──────┬──────────────┘
       │ (2) 402 Payment Required
       │     + PAYMENT-REQUIRED header
       ▼
┌─────────────┐
│   Client    │
│  (Creates   │
│  payment)   │
└──────┬──────┘
       │ (3) POST /compile + PAYMENT-SIGNATURE header
       ▼
┌─────────────────────┐
│  HTTP x402 Server   │
│  (Verifies payment  │
│   via facilitator)  │
└──────┬──────────────┘
       │ (4) 200 OK + Results
       ▼
┌─────────────┐
│   Client    │
└─────────────┘
```

---

## Getting Started

### Prerequisites

1. **Base USDC** - 1-5 USDC for paying for services (Base mainnet or Base Sepolia testnet)
2. **HTTP client** - curl, Postman, or any HTTP library
3. **x402 client library** - `@x402/fetch` for automatic payment handling (recommended)

### Installation

```bash
# Install x402 fetch library
npm install @x402/fetch @x402/evm viem dotenv
```

### Setup Wallet

Create a `.env` file:

```bash
PRIVATE_KEY=0xYourPrivateKeyHere
```

### Server Configuration

Required environment variables for server:

```bash
# Required for HTTP x402 server to start
PAY_TO_ADDRESS=0xYourWalletAddress
SERVER_BASE_URL=https://your-domain.com

# CDP Facilitator credentials (required)
CDP_API_KEY_ID=your_cdp_api_key_id
CDP_API_KEY_SECRET=your_cdp_api_secret

# Optional
HTTP_X402_PORT=8002  # Default: 8002
OPENROUTER_API_KEY=your_key  # Required for AI audit endpoints
```

---

## Available Endpoints

### POST /compile

Compile Solidity smart contracts with the Remix compiler.

**Price**: 0.01 USDC

#### Request

```bash
curl -X POST https://api.remix.live/mcp/x402-http/compile \
  -H "Content-Type: application/json" \
  -d '{
    "sources": {
      "MyToken.sol": {
        "content": "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\n\ncontract MyToken {\n    string public name = \"MyToken\";\n}"
      }
    },
    "version": "v0.8.35+commit.47b9dedd",
    "settings": {
      "optimizer": {
        "enabled": true,
        "runs": 200
      }
    }
  }'
```

#### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sources` | Object | Yes | Map of filename to source code |
| `sources[filename].content` | string | Yes | Solidity source code |
| `version` | string | No | Compiler version (default: "v0.8.35+commit.47b9dedd") |
| `settings` | Object | No | Compiler settings |
| `settings.optimizer.enabled` | boolean | No | Enable optimizer (default: false) |
| `settings.optimizer.runs` | number | No | Optimizer runs (default: 200) |
| `settings.evmVersion` | string | No | EVM version (default: "osaka") |

#### Response (402 Payment Required)

First request without payment returns 402 with payment requirements:

```json
{
  "x402Version": 2,
  "resource": {
    "url": "https://api.remix.live/mcp/x402-http/compile",
    "description": "Compile Solidity contracts...",
    "mimeType": "application/json"
  },
  "accepts": [{
    "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "amount": "10000",
    "network": "eip155:8453",
    "payTo": "0x...",
    "scheme": "exact",
    "maxTimeoutSeconds": 300,
    "extra": {
      "name": "USD Coin",
      "version": "2"
    }
  }],
  "extensions": { /* Bazaar discovery metadata */ }
}
```

#### Response (200 OK)

After payment verification:

```json
{
  "success": true,
  "contracts": {
    "MyToken.sol": {
      "MyToken": {
        "abi": [ /* Contract ABI */ ],
        "evm": {
          "bytecode": {
            "object": "0x608060405..."
          }
        }
      }
    }
  },
  "version": "v0.8.35+commit.47b9dedd"
}
```

---

### POST /analyze

Run Slither security analysis on Solidity contracts.

**Price**: 0.02 USDC

#### Request

```bash
curl -X POST https://api.remix.live/mcp/x402-http/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "sources": {
      "Contract.sol": {
        "content": "// Solidity code here"
      }
    },
    "excludeLow": true,
    "excludeInformational": true
  }'
```

#### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sources` | Object | Yes | Map of filename to source code |
| `version` | string | No | Solidity compiler version |
| `detectors` | Array<string> | No | Specific Slither detectors to run |
| `excludeLow` | boolean | No | Exclude low severity findings |
| `excludeInformational` | boolean | No | Exclude informational findings |

#### Response (200 OK)

```json
{
  "success": true,
  "summary": {
    "totalFindings": 3,
    "high": 1,
    "medium": 1,
    "low": 1,
    "informational": 0
  },
  "findings": [
    {
      "check": "reentrancy-eth",
      "impact": "High",
      "confidence": "High",
      "description": "Reentrancy vulnerability detected..."
    }
  ]
}
```

---

### POST /get_audit_checklist

Get a customized security audit checklist based on contract structure and patterns using AI analysis.

**Price**: Model-dependent (DeepSeek: $0.05, Sonnet: $0.15, Fable: $0.30 USDC)

**⏱️ Async Operation**: Returns immediately with job ID, poll for results

#### Request

```bash
curl -X POST https://api.remix.live/mcp/x402-http/get_audit_checklist \
  -H "Content-Type: application/json" \
  -d '{
    "sources": {
      "MyToken.sol": {
        "content": "// Solidity code here"
      }
    },
    "model": "DeepSeek",
    "maxCategories": 12
  }'
```

#### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sources` | Object | Yes | Map of filename to source code |
| `model` | string | Yes | AI model: "DeepSeek", "Sonnet", or "Fable" |
| `maxCategories` | number | No | Max audit categories (default: 12, max: 20) |

#### Model Pricing

| Model | Price | Description |
|-------|-------|-------------|
| DeepSeek | $0.05 USDC | Fast and cost-effective |
| Sonnet | $0.15 USDC | High quality analysis |
| Fable | $0.30 USDC | Premium quality |

#### Response (202 Accepted)

```json
{
  "success": true,
  "message": "Audit job created. Poll the jobStatusUrl to get results.",
  "jobId": "audit-checklist-1234567890",
  "jobStatusUrl": "https://api.remix.live/mcp/x402-http/job/audit-checklist-1234567890",
  "status": "pending",
  "estimatedCompletionSeconds": 90,
  "instructions": "Poll GET https://api.remix.live/mcp/x402-http/job/... every 5-10 seconds"
}
```

---

### POST /do_audit

Perform a comprehensive AI-powered security audit with detailed findings and severity levels.

**Price**: Model-dependent (DeepSeek: $0.15, Sonnet: $0.25, Fable: $0.70 USDC)

**⏱️ Async Operation**: Returns immediately with job ID, poll for results

#### Request

```bash
curl -X POST https://api.remix.live/mcp/x402-http/do_audit \
  -H "Content-Type: application/json" \
  -d '{
    "sources": {
      "MyToken.sol": {
        "content": "// Solidity code here"
      }
    },
    "checklist": "# Security Audit Checklist\n...",
    "model": "Sonnet"
  }'
```

#### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sources` | Object | Yes | Map of filename to source code |
| `checklist` | string | Yes | Audit checklist in markdown format |
| `model` | string | Yes | AI model: "DeepSeek", "Sonnet", or "Fable" |

#### Model Pricing

| Model | Price | Description |
|-------|-------|-------------|
| DeepSeek | $0.15 USDC | Fast and cost-effective |
| Sonnet | $0.25 USDC | High quality audit |
| Fable | $0.70 USDC | Premium comprehensive audit |

#### Response (202 Accepted)

```json
{
  "success": true,
  "message": "Audit job created. Poll the jobStatusUrl to get results.",
  "jobId": "do-audit-1234567890",
  "jobStatusUrl": "https://api.remix.live/mcp/x402-http/job/do-audit-1234567890",
  "status": "pending",
  "estimatedCompletionSeconds": 120,
  "instructions": "Poll GET https://api.remix.live/mcp/x402-http/job/... every 5-10 seconds"
}
```

---

### GET /job/:id

Poll for async job results (audit checklist or complete audit).

**Price**: FREE (no payment required)

#### Request

```bash
curl https://api.remix.live/mcp/x402-http/job/audit-checklist-1234567890
```

#### Response (Job Pending/Processing)

```json
{
  "jobId": "audit-checklist-1234567890",
  "status": "processing",
  "endpoint": "/get_audit_checklist",
  "model": "DeepSeek",
  "createdAt": "2026-10-15T12:00:00.000Z",
  "elapsedSeconds": 45,
  "message": "Job is processing",
  "pollingUrl": "https://api.remix.live/mcp/x402-http/job/audit-checklist-1234567890",
  "instructions": "Continue polling this URL every 5-10 seconds"
}
```

#### Response (Job Completed)

```json
{
  "jobId": "audit-checklist-1234567890",
  "status": "completed",
  "endpoint": "/get_audit_checklist",
  "model": "DeepSeek",
  "createdAt": "2026-10-15T12:00:00.000Z",
  "completedAt": "2026-10-15T12:01:30.000Z",
  "processingSeconds": 90,
  "result": {
    "success": true,
    "markdown": "# Security Audit Checklist Report\n\n**Contract**: MyToken.sol...",
    "matchedCategories": 8,
    "model": "openrouter/deepseek/deepseek-chat",
    "tokensUsed": 3456
  }
}
```

#### Response (Job Failed)

```json
{
  "jobId": "audit-checklist-1234567890",
  "status": "failed",
  "endpoint": "/get_audit_checklist",
  "error": "OpenRouter API error: Rate limit exceeded",
  "message": "Job processing failed"
}
```

---

### GET /info

Get server information and available endpoints (no payment required).

#### Response

```json
{
  "name": "Remix x402 HTTP Server",
  "version": "1.0.0",
  "protocol": "x402",
  "endpoints": {
    "compile": {
      "path": "/compile",
      "method": "POST",
      "price": "0.01 USDC"
    },
    "analyze": {
      "path": "/analyze",
      "method": "POST",
      "price": "0.02 USDC"
    },
    "get_audit_checklist": {
      "path": "/get_audit_checklist",
      "method": "POST",
      "pricing": {
        "DeepSeek": "0.05 USDC",
        "Sonnet": "0.15 USDC",
        "Fable": "0.30 USDC"
      }
    },
    "do_audit": {
      "path": "/do_audit",
      "method": "POST",
      "pricing": {
        "DeepSeek": "0.15 USDC",
        "Sonnet": "0.25 USDC",
        "Fable": "0.70 USDC"
      }
    }
  },
  "network": "Base Mainnet",
  "chainId": 8453
}
```

---

### GET /health

Health check endpoint (no payment required).

#### Response

```json
{
  "status": "healthy"
}
```

---

## Payment Flow

The HTTP x402 server uses the **CDP Facilitator** for payment settlement:

```
Client                 Server              Facilitator         Blockchain
  |                      |                      |                  |
  |---(1) Request------->|                      |                  |
  |      POST /compile   |                      |                  |
  |      (no payment)    |                      |                  |
  |                      |                      |                  |
  |<--(2) 402 Payment----|                      |                  |
  |      Required        |                      |                  |
  |      + requirements  |                      |                  |
  |                      |                      |                  |
  |===(3) Create EIP-3009 Signature============|                  |
  |      (gasless EIP-712, no blockchain tx)   |                  |
  |                      |                      |                  |
  |---(4) POST /compile->|                      |                  |
  |      + Payment-      |                      |                  |
  |      Signature       |                      |                  |
  |                      |                      |                  |
  |                      |---(5) verify()------>|                  |
  |                      |      (validate sig)  |                  |
  |                      |                      |                  |
  |                      |<--(6) Valid----------|                  |
  |                      |                      |                  |
  |                      |---(7) settle()------>|                  |
  |                      |                      |                  |
  |                      |                      |---(8) Execute--->|
  |                      |                      |      USDC        |
  |                      |                      |      Transfer    |
  |                      |                      |   (Facilitator   |
  |                      |                      |    pays gas!)    |
  |                      |                      |                  |
  |                      |                      |<--(9) Confirmed--|
  |                      |                      |                  |
  |                      |<--(10) Settled-------|                  |
  |                      |       Success        |                  |
  |                      |                      |                  |
  |              (11) Execute Tool              |                  |
  |                      |                      |                  |
  |<--(12) 200 OK--------|                      |                  |
  |       Results        |                      |                  |
```

**Key Points:**
- **Step 3**: Client only creates a gasless EIP-712 signature (NO gas cost!)
- **Steps 5-10**: Server coordinates with facilitator for verification and settlement
- **Step 8**: Facilitator pays gas fees on blockchain, not client
- **Step 11**: Server only executes tool after confirmed payment
- **Result**: You pay only the USDC service fee, NO gas fees!

---

## Using @x402/fetch Library

The easiest way to use the HTTP x402 server is with the `@x402/fetch` library, which handles payments automatically:

### Example: Compile Contract

```javascript
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import dotenv from "dotenv";

dotenv.config();

// Setup wallet
const privateKey = process.env.PRIVATE_KEY;
const evmSigner = privateKeyToAccount(privateKey);

// Create x402 client
const client = new x402Client();
const exactScheme = new ExactEvmScheme(evmSigner);
client.register("eip155:8453", exactScheme); // Base Mainnet

// Wrap fetch with payment handling
const x402Fetch = wrapFetchWithPayment(fetch, client);

// Make request - payment happens automatically!
const response = await x402Fetch("https://api.remix.live/mcp/x402-http/compile", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    sources: {
      "SimpleStorage.sol": {
        content: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract SimpleStorage {
    uint256 public value;
    function set(uint256 _value) public { value = _value; }
}
        `
      }
    }
  })
});

const result = await response.json();
console.log("Compilation result:", result);
```

### What Happens Behind the Scenes

1. `x402Fetch` detects 402 Payment Required response
2. Extracts payment requirements from response
3. Your wallet signs EIP-3009 authorization (gasless)
4. Client retries request with payment signature
5. **Server's facilitator settles payment on-chain** (pays gas)
6. You receive the compilation result

---

## Facilitator Service

### What is a Facilitator?

A **facilitator** is a payment settlement service that:
- Verifies EIP-3009 payment signatures
- Executes USDC transfers on-chain
- **Pays gas fees** on your behalf
- Provides transaction confirmation

### CDP Facilitator (Used by Server)

- **URL**: `https://api.cdp.coinbase.com/platform/v2/x402`
- **Networks**: All networks (testnet + mainnet)
- **Authentication**: JWT with Ed25519 signing
- **Benefits**:
  - Production-ready infrastructure from Coinbase
  - Enterprise-grade reliability and uptime
  - Automatic service cataloging on agentic.market
  - No client changes needed - transparent to users

### For Clients

> **Important**: The facilitator is transparent - you just send payment signatures, the server handles all facilitator communication. No client-side configuration needed!

---

## Error Handling

### Common Errors

#### Insufficient USDC

```json
{
  "error": "Insufficient USDC balance"
}
```

#### Payment Verification Failed

```json
{
  "error": "Invalid or unconfirmed payment",
  "details": "Payment authorization failed or settlement was rejected"
}
```

#### Compilation Error

```json
{
  "success": false,
  "errors": [
    {
      "severity": "error",
      "message": "ParserError: Expected ';' but got 'identifier'"
    }
  ]
}
```

#### Post-Payment Errors

If an error occurs after payment has been settled, the response includes payment status:

```json
{
  "success": false,
  "error": "Service execution failed",
  "message": "An unexpected error occurred during compilation",
  "paymentStatus": "settled",
  "requestId": "compile-1234567890",
  "timestamp": "2026-10-15T12:00:00.000Z"
}
```

---

## Network Details

- **Network**: Base Mainnet
- **Chain ID**: 8453
- **USDC Contract**: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- **RPC**: `https://mainnet.base.org`

For testnet (Base Sepolia):
- **Chain ID**: 84532
- **USDC Contract**: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- **RPC**: `https://sepolia.base.org`

---

## Support

For issues, questions, or feature requests:
- **GitHub**: [github.com/remix-project-org/x402](https://github.com/remix-project-org/x402)
- **Documentation**:
  - [README.md](README.md) - Project overview
  - [MCP_API_REFERENCE.md](MCP_API_REFERENCE.md) - MCP tools API
  - [CLAUDE_AGENTIC_WALLET_GUIDE.md](CLAUDE_AGENTIC_WALLET_GUIDE.md) - Coinbase wallet setup
  - [CLI_AGENTIC_WALLET_GUIDE.md](CLI_AGENTIC_WALLET_GUIDE.md) - CLI usage examples
- **Bazaar**: [agentic.market](https://agentic.market) - Discover and validate x402 services

---

## Example Code Repository

Complete working examples are available in `src/examples/`:

- `compile-http.js` - Full compilation example with @x402/fetch
- `analyze-http.js` - Security analysis example
- `audit-checklist-example.js` - AI audit checklist example
- `do-audit-example.js` - Complete AI audit example

Run examples:
```bash
node src/examples/compile-http.js
node src/examples/audit-checklist-example.js
```

---

**Need MCP tools instead?** See [MCP_API_REFERENCE.md](MCP_API_REFERENCE.md) for using with AI agents like Claude.
