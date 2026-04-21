# x402 MCP Server

An MCP (Model Context Protocol) server implementing the x402 payment protocol for paid Solidity compilation services using USDC on Base Sepolia.

## Overview

This project demonstrates a complete x402 payment flow where:
- **Client** creates payment authorizations and settles them on-chain (pays gas fees)
- **Server** verifies payment settlement on-chain before providing services
- Payments are made in USDC using EIP-3009 `TransferWithAuthorization`

## Features

- **Paid Solidity Compilation**: Compile Solidity contracts using Remix compiler (0.5 USDC per compilation)
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
- Verifies payment settlement on-chain before executing compilation

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

### 2. Run the Client

```bash
yarn run client
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

## Links

- [x402 Protocol](https://github.com/ampersand-ai/x402)
- [Ampersend SDK](https://github.com/ampersand-ai/ampersend-sdk)
- [EIP-3009 Specification](https://eips.ethereum.org/EIPS/eip-3009)
