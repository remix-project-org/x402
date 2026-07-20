# HTTP x402 Server Usage Guide

Welcome to the HTTP x402 Server! This guide covers using the **HTTP REST endpoints** with the x402 payment protocol and facilitator-based settlement.

> **Note**: For MCP server usage (AI agents like Claude), see [MCP_USAGE.md](MCP_USAGE.md)

## What is the HTTP x402 Server?

The HTTP x402 server provides standard REST endpoints that implement the x402 payment protocol. Unlike the MCP server, it uses a **facilitator service** to handle payment verification and settlement, which means:

✅ **No gas fees for clients** - the facilitator pays transaction fees
✅ **Simpler integration** - standard HTTP requests
✅ **Production-ready** - supports CDP Facilitator for mainnet

## Available Endpoints

### POST /compile
Compile Solidity smart contracts
**Price**: 0.01 USDC

### POST /analyze
Run Slither security analysis
**Price**: 0.02 USDC

### GET /info
Get server information (no payment required)

### GET /health
Health check endpoint (no payment required)

> 📚 **For complete endpoint specifications**, see [HTTP_X402_ENDPOINTS.md](HTTP_X402_ENDPOINTS.md)

## Getting Started

### Prerequisites

1. **Base Sepolia USDC** - 1-5 USDC for paying for services
2. **HTTP client** - curl, Postman, or any HTTP library
3. **x402 client library** - `@x402/fetch` for automatic payment handling

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

## Payment Flow with Facilitator

The HTTP x402 server uses a **facilitator service** for payment settlement:

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
  |                      |                      |                  |
  |===(3) Create EIP-3009 Signature============|                  |
  |      (gasless EIP-712, no blockchain tx)   |                  |
  |                      |                      |                  |
  |---(4) POST /compile->|                      |                  |
  |      + Payment-      |                      |                  |
  |      Signature       |                      |                  |
  |      header          |                      |                  |
  |                      |                      |                  |
  |                      |---(5) verify()------>|                  |
  |                      |      (validate sig)  |                  |
  |                      |                      |                  |
  |                      |<--(6) Valid----------|                  |
  |                      |      ✓               |                  |
  |                      |                      |                  |
  |                      |---(7) settle()------>|                  |
  |                      |      (execute tx)    |                  |
  |                      |                      |                  |
  |                      |                      |---(8) Execute--->|
  |                      |                      |      USDC        |
  |                      |                      |      Transfer    |
  |                      |                      |   (Facilitator   |
  |                      |                      |    pays gas!)    |
  |                      |                      |                  |
  |                      |                      |<--(9) TX Hash)---|
  |                      |                      |      Confirmed   |
  |                      |                      |                  |
  |                      |<--(10) Settled-------|                  |
  |                      |       Success        |                  |
  |                      |       + TX Hash      |                  |
  |                      |                      |                  |
  |              (11) Execute Tool              |                  |
  |              (compile Solidity)             |                  |
  |                      |                      |                  |
  |<--(12) 200 OK--------|                      |                  |
  |       Results        |                      |                  |
  |       + metadata     |                      |                  |
  |                      |                      |                  |
```

**Key Points:**
- **Step 3**: Client only creates a gasless EIP-712 signature (NO gas cost!)
- **Steps 5-10**: Server coordinates with facilitator for verification and settlement
- **Step 8**: Facilitator pays gas fees on blockchain, not client
- **Step 11**: Server only executes tool after confirmed payment
- **Result**: You pay only the USDC service fee (0.01 or 0.02), NO gas fees!

**Why This Matters:**
- Traditional flow: You pay service fee + gas fees (~$0.50-$2.00 in gas)
- Facilitator flow: You pay ONLY service fee ($0.01-$0.02), facilitator pays gas
- Savings: 95%+ cost reduction for clients!

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
client.register("eip155:84532", exactScheme); // Base Sepolia

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

    function set(uint256 _value) public {
        value = _value;
    }

    function get() public view returns (uint256) {
        return value;
    }
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

## Manual Payment Flow

If you prefer manual control, you can handle the 402 flow yourself:

### Step 1: Make Initial Request

```bash
curl -X POST https://api.remix.live/mcp/x402-http/compile \
  -H "Content-Type: application/json" \
  -d '{"sources":{"Test.sol":{"content":"pragma solidity ^0.8.0; contract Test {}"}}}'
```

**Response (402 Payment Required)**:
```json
{
  "x402Version": 2,
  "resource": { "url": "https://..." },
  "accepts": [{
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "amount": "10000",
    "network": "eip155:84532",
    "payTo": "0x...",
    "scheme": "exact",
    "maxTimeoutSeconds": 300
  }]
}
```

### Step 2: Create EIP-3009 Signature

Use your wallet to sign an EIP-712 message authorizing the USDC transfer.

### Step 3: Retry with Payment

```bash
curl -X POST https://api.remix.live/mcp/x402-http/compile \
  -H "Content-Type: application/json" \
  -H "Payment-Signature: <base64-encoded-payment-signature>" \
  -d '{"sources":{"Test.sol":{"content":"pragma solidity ^0.8.0; contract Test {}"}}}'
```

**Response (200 OK)**:
```json
{
  "success": true,
  "contracts": { "Test.sol": { "Test": { "abi": [...], "evm": {...} } } },
  "version": "v0.8.35+commit.47b9dedd"
}
```

## Facilitator Service

### What is a Facilitator?

A **facilitator** is a payment settlement service that:
- Verifies EIP-3009 payment signatures
- Executes USDC transfers on-chain
- **Pays gas fees** on your behalf
- Provides transaction confirmation

### Server-Side Facilitator Configuration

The server uses the CDP Facilitator for payment settlement:

#### CDP Facilitator (Required)

```bash
# Set these environment variables on the server
CDP_API_KEY_ID=your_api_key_id
CDP_API_KEY_SECRET=your_api_key_secret
```

- **URL**: `https://api.cdp.coinbase.com/platform/v2/x402`
- **Networks**: All networks (testnet + mainnet)
- **Authentication**: JWT with Ed25519 signing
- **Cost**: Per transaction (gas fees paid by facilitator)
- **Best for**: Development and production deployments

**How to get CDP credentials:**
1. Sign up at [Coinbase Developer Platform](https://portal.cdp.coinbase.com/)
2. Create a new API key
3. Set `CDP_API_KEY_ID` and `CDP_API_KEY_SECRET` environment variables
4. Start the server - it will use CDP facilitator

**Server startup log will show:**
```
🔐 Facilitator: CDP - https://api.cdp.coinbase.com/platform/v2/x402
```

### CDP Facilitator Benefits

- **Production-ready infrastructure** from Coinbase
- **Mainnet and testnet support** (not just testnet)
- **Enterprise-grade reliability** and uptime
- **Automatic service cataloging** on agentic.market
- **JWT authentication** with Ed25519 signing
- **On-chain verification** before service execution
- **No client changes needed** - transparent to users

### For Clients (You)

> **Important**: The facilitator is transparent - you just send payment signatures, the server handles all facilitator communication. No client-side configuration needed!

## Pricing

### Fixed Price Tools
- **Compilation**: 0.01 USDC
- **Security Analysis**: 0.02 USDC

### Cost Breakdown
- **Service fee**: 0.01 USDC (or 0.02 USDC for analysis)
- **Gas fees**: $0 (paid by facilitator!)
- **Your total cost**: Just the service fee

## Network Details

- **Network**: Base Sepolia Testnet
- **Chain ID**: 84532
- **USDC Contract**: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- **RPC**: `https://sepolia.base.org`

## Error Handling

### Common Errors

**Insufficient USDC**:
```json
{
  "error": "Insufficient USDC balance"
}
```

**Payment Verification Failed**:
```json
{
  "error": "Payment verification failed"
}
```

**Compilation Error**:
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

## Security Notes

✅ **Your private keys never leave your machine**
✅ **Signatures are gasless** (EIP-712, no blockchain tx)
✅ **Facilitator pays gas**, not you
✅ **All payments verified on-chain** before service execution
✅ **Transparent pricing** - no hidden fees

## Example Code Repository

Complete working examples are available in `src/examples/`:

- `compile-http.js` - Full compilation example with @x402/fetch
- Shows automatic payment handling
- Demonstrates error handling

## Production Usage

### Get USDC on Base Sepolia (Testnet)

1. Get Base Sepolia ETH from [faucet](https://www.alchemy.com/faucets/base-sepolia)
2. Bridge or use a faucet for Base Sepolia USDC

### Mainnet (Coming Soon)

When mainnet launches:
- Same endpoints and flow
- Real USDC on Base mainnet
- CDP Facilitator for production reliability

## Troubleshooting

**Q: Do I need to pay gas fees?**
A: No! The facilitator pays gas fees. You only pay the service fee in USDC.

**Q: What if payment fails?**
A: Fix the issue (e.g., insufficient USDC) and retry.

**Q: How do I check my transaction?**
A: Check Base Sepolia block explorer: https://sepolia.basescan.org

## Support

- **Technical docs**: [HTTP_X402_ENDPOINTS.md](HTTP_X402_ENDPOINTS.md)
- **API Reference**: [API_REFERENCE.md](API_REFERENCE.md)
- **GitHub Issues**: Report bugs or request features

## Next Steps

- ✅ Try the example: `node src/examples/compile-http.js`
- 📖 Read endpoint specs: [HTTP_X402_ENDPOINTS.md](HTTP_X402_ENDPOINTS.md)
- 🚀 Build your integration with `@x402/fetch`

---

**Need the MCP server instead?** See [MCP_USAGE.md](MCP_USAGE.md) for using with AI agents like Claude.
