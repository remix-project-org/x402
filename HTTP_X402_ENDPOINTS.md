# HTTP x402 REST Endpoints

This document describes the HTTP REST endpoints that implement the x402 payment protocol with proper 402 status codes and payment headers.

## Overview

In addition to the MCP server, this implementation provides standard HTTP REST endpoints that follow the x402 protocol specification. These endpoints are designed to be compatible with standard x402 HTTP clients and validators like agentic.market/validate.

## Architecture

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       │ (1) POST /compile (no payment)
       ▼
┌─────────────────────┐
│  HTTP x402 Server   │
│   (Port 8002)       │
└──────┬──────────────┘
       │
       │ (2) 402 Payment Required
       │     + PAYMENT-REQUIRED header
       ▼
┌─────────────┐
│   Client    │
│  (Creates   │
│  payment)   │
└──────┬──────┘
       │
       │ (3) POST /compile
       │     + PAYMENT-SIGNATURE header
       ▼
┌─────────────────────┐
│  HTTP x402 Server   │
│  (Verifies payment  │
│   on-chain)         │
└──────┬──────────────┘
       │
       │ (4) 200 OK
       │     + PAYMENT-RESPONSE header
       │     + Compilation results
       ▼
┌─────────────┐
│   Client    │
└─────────────┘
```

## Configuration

### Required Environment Variables

```bash
# Required for HTTP x402 server to start
PAY_TO_ADDRESS=0xYourWalletAddress
```

### Optional Environment Variables

```bash
# Custom port for HTTP x402 server (default: 8002)
HTTP_X402_PORT=8002

# Base URL for HTTP endpoints in discovery metadata
HTTP_X402_BASE_URL=http://localhost:8002
```

## Available Endpoints

### POST /compile

Compile Solidity smart contracts with x402 payment.

**Price**: 0.01 USDC

**Request without payment**:
```bash
curl -X POST http://localhost:8002/compile \
  -H "Content-Type: application/json" \
  -d '{
    "sources": {
      "MyToken.sol": {
        "content": "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\n\ncontract MyToken {\n    string public name = \"MyToken\";\n}"
      }
    }
  }'
```

**Response (402 Payment Required)**:
```json
{
  "error": "Payment Required",
  "message": "This endpoint requires payment",
  "amount": "0.01 USDC",
  "network": "Base Sepolia Testnet"
}
```

**Response Headers**:
```
HTTP/1.1 402 Payment Required
Content-Type: application/json
PAYMENT-REQUIRED: <base64-encoded-payment-requirements>
```

**Request with payment**:
```bash
curl -X POST http://localhost:8002/compile \
  -H "Content-Type: application/json" \
  -H "Payment-Signature: <base64-encoded-payment-signature>" \
  -d '{
    "sources": {
      "MyToken.sol": {
        "content": "..."
      }
    }
  }'
```

**Response (200 OK)**:
```json
{
  "success": true,
  "contracts": {
    "MyToken.sol": {
      "MyToken": {
        "abi": [...],
        "evm": {
          "bytecode": {...}
        }
      }
    }
  },
  "version": "v0.8.35+commit.47b9dedd"
}
```

**Response Headers**:
```
HTTP/1.1 200 OK
Content-Type: application/json
PAYMENT-RESPONSE: <base64-encoded-settlement-confirmation>
```

### POST /analyze

Run Slither security analysis with x402 payment.

**Price**: 0.02 USDC

**Request/Response**: Same pattern as `/compile` endpoint

**Request Body**:
```json
{
  "sources": {
    "Contract.sol": {
      "content": "..."
    }
  },
  "excludeLow": true,
  "excludeInformational": true
}
```

**Response (200 OK)**:
```json
{
  "success": true,
  "findings": [
    {
      "check": "reentrancy-eth",
      "impact": "High",
      "description": "..."
    }
  ],
  "summary": {
    "totalFindings": 1,
    "high": 1,
    "medium": 0,
    "low": 0
  }
}
```

### GET /info

Get service information (no payment required).

**Response**:
```json
{
  "name": "Remix x402 HTTP Server",
  "version": "1.0.0",
  "protocol": "x402",
  "endpoints": {
    "compile": {
      "path": "/compile",
      "method": "POST",
      "price": "0.01 USDC",
      "description": "Compile Solidity contracts"
    },
    "analyze": {
      "path": "/analyze",
      "method": "POST",
      "price": "0.02 USDC",
      "description": "Security analysis with Slither"
    }
  },
  "network": "Base Sepolia Testnet",
  "chainId": 84532,
  "payTo": "0x..."
}
```

### GET /health

Health check endpoint (no payment required).

**Response**:
```json
{
  "status": "healthy"
}
```

## x402 Protocol Implementation

### Payment Requirements Header

When a request is made without payment, the server responds with:

```
HTTP/1.1 402 Payment Required
PAYMENT-REQUIRED: <base64-encoded-json>
```

The decoded JSON contains:
```json
{
  "scheme": "exact",
  "network": "base-sepolia",
  "maxAmountRequired": "10000",
  "resource": "localhost:8002/compile",
  "mimeType": "application/json",
  "payTo": "0x...",
  "maxTimeoutSeconds": 300,
  "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  "extra": {
    "name": "USDC",
    "version": "2"
  }
}
```

### Payment Signature Header

Clients include payment authorization in the request:

```
Payment-Signature: <base64-encoded-payment-authorization>
```

The decoded JSON contains EIP-3009 USDC authorization with EIP-712 signature.

### Payment Response Header

On successful payment verification, the server responds with:

```
HTTP/1.1 200 OK
PAYMENT-RESPONSE: <base64-encoded-json>
```

The decoded JSON contains:
```json
{
  "status": "settled",
  "network": "base-sepolia",
  "amount": "10000"
}
```

## Payment Verification Flow

1. **Client makes request** without payment
2. **Server returns 402** with payment requirements in header
3. **Client creates authorization**:
   - Signs EIP-712 message for USDC transfer
   - Creates EIP-3009 authorization
4. **Client submits transaction** on-chain (pays gas)
5. **Client retries request** with `Payment-Signature` header
6. **Server verifies payment**:
   - Decodes payment signature
   - Calls facilitator to verify on-chain settlement
   - Checks USDC was received
7. **Server executes service** (compilation or analysis)
8. **Server returns 200** with `Payment-Response` header

## Comparison: HTTP vs MCP Endpoints

| Feature | HTTP x402 Endpoints | MCP Tools |
|---------|---------------------|-----------|
| **Protocol** | HTTP REST + x402 | MCP (JSON-RPC) + x402 |
| **Port** | 8002 | 8000 |
| **Payment Flow** | 402 status + headers | MCP payment protocol |
| **Discovery** | HTTP metadata in Bazaar | MCP metadata in Bazaar |
| **Validation** | agentic.market/validate ✓ | MCP clients ✓ |
| **Tools Available** | 2 (compile, analyze) | 4 (compile, analyze, deploy, multi-deploy) |
| **Use Case** | Standard HTTP clients | AI agents with MCP support |

## Discovery Metadata

When `PAY_TO_ADDRESS` is configured, the HTTP endpoints are automatically included in the discovery endpoint (`http://localhost:8001/discovery`) with type `"http"`:

```json
{
  "resource": "http://localhost:8002/compile",
  "type": "http",
  "accepts": [{
    "asset": "USDC",
    "amount": "10000",
    "network": "eip155:84532",
    "payTo": "0x...",
    "scheme": "exact"
  }],
  "extensions": {
    "bazaar": {
      "info": {
        "input": {
          "type": "http",
          "method": "POST",
          "description": "...",
          "example": {...}
        },
        "output": {
          "type": "json",
          "example": {...}
        }
      }
    }
  },
  "serviceName": "Remix Compiler (HTTP)",
  "tags": ["solidity", "compiler", "http", "x402"]
}
```

## Validation on agentic.market

To validate your HTTP x402 endpoints:

1. **Set `PAY_TO_ADDRESS`** in your `.env` file
2. **Start the server**: `yarn build && yarn start`
3. **Expose with public URL** (e.g., using ngrok):
   ```bash
   ngrok http 8002
   ```
4. **Visit**: https://agentic.market/validate
5. **Enter endpoint**: `https://your-ngrok-url.ngrok.io/compile`
6. **Verify**: The validator will test:
   - 402 response with PAYMENT-REQUIRED header
   - Payment header format
   - Facilitator configuration
   - Bazaar indexing (if applicable)

## Security Notes

- Payment verification is done on-chain before service execution
- Client pays gas fees for the USDC transfer
- Server never handles client private keys
- EIP-3009 provides gasless approval signatures
- All payments settled on blockchain (transparent and verifiable)

## Troubleshooting

**HTTP x402 server not starting**:
```
⚠️  PAY_TO_ADDRESS not set. HTTP x402 server will not start.
```
→ Set `PAY_TO_ADDRESS` environment variable

**Port already in use**:
```
❌ Port 8002 is already in use.
```
→ Set `HTTP_X402_PORT` to a different port

**Payment verification fails**:
- Ensure client has submitted the USDC transfer on-chain
- Check that payment network matches server network
- Verify USDC contract address is correct
- Ensure sufficient USDC balance

## Next Steps

- Deploy to production with a public domain
- Set `HTTP_X402_BASE_URL` to your public URL
- Configure firewall to allow port 8002
- Monitor payment settlements on blockchain explorer
- Validate endpoints on agentic.market/validate
