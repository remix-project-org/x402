# x402 MCP Server

An MCP (Model Context Protocol) server implementing the x402 payment protocol for paid Solidity development tools using USDC on Base Sepolia.

## Overview

This project demonstrates a complete x402 payment flow where:
- **Client** creates payment authorizations and settles them on-chain (pays gas fees)
- **Server** verifies payment settlement on-chain before providing services
- Payments are made in USDC using EIP-3009 `TransferWithAuthorization`

## Features

- **Paid Solidity Compilation**: Compile Solidity contracts using Remix compiler (0.5 USDC per compilation)
- **Paid Slither Analysis**: Security analysis of Solidity contracts using Slither (0.75 USDC per analysis)
- **x402 Payment Protocol**: Fully compliant implementation with on-chain settlement verification
- **USDC Payments**: ERC-20 token payments on Base Sepolia testnet
- **Custom Wallet**: EIP-712 signature implementation for USDC compatibility
- **MCP Integration**: Built with Ampersend SDK for seamless payment-gated tools

## Architecture

### Client Side
- `src/client/index.js` - MCP client setup and configuration
- `src/client/treasurer.js` - Handles payment authorization and on-chain settlement
- `src/client/usdc-wallet.js` - Custom wallet with USDC-compatible EIP-712 signatures

### Server Side
- `src/server/index.ts` - MCP server with payment-gated tools
- Verifies payment settlement on-chain before executing tools
- Integrates with Remix API for Slither analysis

## Prerequisites

- Node.js (v18 or higher)
- USDC on Base Sepolia testnet
- Private key for your wallet

## Installation

```bash
# Install dependencies
npm install

# or
yarn install
```

## Configuration

1. Create a `.env` file in the project root:

```env
# Your wallet private key (DO NOT commit this!)
PRIVATE_KEY=0x...

# Address where payments should be sent (server owner's address)
PAY_TO_ADDRESS=0x...
```

2. Get testnet USDC

## Building

```bash
# Build TypeScript files
npm run build

# or
yarn build
```

## Usage

### 1. Start the MCP Server

```bash
yarn start
```

The server will start on `http://localhost:8000/mcp`

### 2. Run the Clients

#### Solidity Compilation Client

```bash
npm run compile
```

The client will:
1. Connect to the MCP server
2. Request the `compile_solidity` tool
3. Receive a 402 Payment Required response
4. Create a USDC payment authorization
5. Settle the payment on-chain (client pays gas)
6. Re-request with payment proof
7. Server verifies settlement on-chain
8. Compilation executes and returns results

#### Slither Analysis Client

```bash
npm run slither
```

The client will:
1. Connect to the MCP server
2. Request the `analyze_with_slither` tool with a vulnerable contract
3. Handle payment flow (same as compilation flow)
4. Server forwards request to Remix Slither API
5. Receive detailed security findings organized by severity:
   - High severity issues (reentrancy, etc.)
   - Medium severity issues (tx.origin, etc.)
   - Low severity issues (naming conventions, etc.)
   - Informational findings

## Payment Flow

```
Client                          Server
  |                               |
  |---(1) Request Tool----------->|
  |                               |
  |<--(2) 402 Payment Required----|
  |                               |
  |---(3) Create Authorization--->|
  |                               |
  |---(4) Settle On-Chain-------->| (Blockchain)
  |                               |
  |---(5) Re-request with Proof-->|
  |                               |
  |                      (6) Verify Settlement
  |                               |
  |<--(7) Execute & Return--------|
```

## Tools Available

### compile_solidity

Compiles Solidity contracts using the Remix compiler.

**Payment Required**: 0.5 USDC (500000 with 6 decimals)

**Parameters**:
- `sources`: Object with contract filenames as keys and their content
- `settings` (optional): Compiler settings (optimizer, evmVersion)

**Example**:
```javascript
{
  sources: {
    "SimpleStorage.sol": {
      content: "contract SimpleStorage { uint256 value; }"
    }
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "london"
  }
}
```

### analyze_with_slither

Runs Slither security analysis on Solidity contracts using the Remix API endpoint to detect vulnerabilities, optimization opportunities, and best practice violations.

**Payment Required**: 0.75 USDC (750000 with 6 decimals)

**API Endpoint**: `https://mcp.api.remix.live/slither/analyze`

**Parameters**:
- `sources`: Object with contract filenames as keys and their content
- `version` (optional): Solidity compiler version (e.g., `"0.8.26+commit.8a97fa7a"`). Defaults to `0.8.26`
- `detectors` (optional): Array of specific detectors to run (e.g., `['reentrancy-eth', 'tx-origin']`). Filters results client-side.
- `excludeInformational` (optional): Filter out informational severity findings
- `excludeLow` (optional): Filter out low severity findings

**Returns**:
```javascript
{
  "success": true,
  "summary": {
    "totalFindings": 4,
    "high": 1,
    "medium": 0,
    "low": 3,
    "informational": 0,
    "optimization": 0
  },
  "findings": [
    {
      "check": "reentrancy-eth",
      "impact": "High",
      "confidence": "Medium",
      "description": "Reentrancy in VulnerableBank.withdraw...",
      "reference": "https://github.com/crytic/slither/wiki/..."
    }
    // ... more findings
  ],
  "rawAnalysis": "Full Slither text output",
  "rawOutput": { /* Remix API response */ }
}
```

**Output includes**:
- Summary with counts by severity (High, Medium, Low, Informational, Optimization)
- Detailed findings with detector name, impact level, confidence, and description
- Reference URLs to Slither documentation for each detector
- Raw analysis text and API response for advanced use

**Example**:
```javascript
{
  sources: {
    "VulnerableBank.sol": {
      content: "contract VulnerableBank { ... }"
    }
  },
  version: "0.8.26+commit.8a97fa7a",
  excludeInformational: false,
  excludeLow: false
}
```

**Impact Level Classification**:
- **High**: `reentrancy-eth`, `reentrancy-no-eth`, `suicidal`, `unprotected-upgrade`
- **Medium**: `reentrancy-benign`, `reentrancy-events`, `tx-origin`, `unchecked-transfer`
- **Low**: `low-level-calls`, `naming-convention`, `solc-version`
- **Informational**: All other detectors

**Note**: This tool uses the Remix Slither API (`https://mcp.api.remix.live/slither/analyze`), so no local Slither installation is required. The server parses the Remix API text output and structures it into categorized findings.

## Network Details

- **Network**: Base Sepolia
- **Chain ID**: 84532
- **USDC Contract**: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- **RPC**: `https://sepolia.base.org`

## Security Notes

- Never commit your private key
- Only use testnet funds for development
- The `.env` file is gitignored by default
- Server verifies all payments on-chain before executing tools

## Example Output

### Slither Analysis Example

```bash
$ npm run slither

🔌 Connecting to MCP server...
✅ Connected!

🔍 Running Slither security analysis...

✅ Analysis completed successfully!
   (Payment was settled on-chain and verified before analysis)

📋 Summary:
   Total Findings: 4
   High Severity: 1
   Medium Severity: 0
   Low Severity: 3
   Informational: 0
   Optimization: 0

🐛 Detailed Findings:

  1. [High] reentrancy-eth
     Confidence: Medium
     Reentrancy in VulnerableBank.withdraw(uint256)...
     External calls:
     - (success,None) = msg.sender.call{value: _amount}()
     ... (5 more lines)
     Reference: https://github.com/crytic/slither/wiki/Detector-Documentation#reentrancy-vulnerabilities-1

  2. [Low] solc-version
     Confidence: Medium
     Version constraint ^0.8.0 contains known severe issues...

  3. [Low] low-level-calls
     Confidence: Medium
     Low level call in VulnerableBank.withdraw(uint256)...

  4. [Low] naming-convention
     Confidence: Medium
     Parameter VulnerableBank.withdraw(uint256)._amount is not in mixedCase...
```

## Links

- [x402 Protocol](https://github.com/ampersand-ai/x402)
- [Ampersend SDK](https://github.com/ampersand-ai/ampersend-sdk)
- [EIP-3009 Specification](https://eips.ethereum.org/EIPS/eip-3009)
- [Slither Documentation](https://github.com/crytic/slither)
- [Remix IDE](https://remix.ethereum.org)
