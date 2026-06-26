# Remix x402 MCP Server

An MCP (Model Context Protocol) server implementing the x402 payment protocol for paid Solidity development tools using USDC on Base networks (Sepolia testnet and mainnet).

## Overview

This is a **server-side implementation** of an x402-enabled MCP server that provides paid Solidity development tools. The server:
- **Verifies x402 payment settlements** on-chain before providing services
- **Provides Solidity compilation**, security analysis, and deployment services
- **Uses USDC payments** via EIP-3009 `TransferWithAuthorization`
- **Operates a delegated deployment service** where the server deploys contracts on behalf of clients

## Quick Links

- 📖 **[Usage Guide](USAGE.md)** - Getting started, wallet setup, payment flow, and examples
- 📚 **[API Reference](API_REFERENCE.md)** - Complete API specs for all 4 tools
- 🖥️ **[Claude Setup Guide](CLAUDE_SETUP.md)** - Connect to Claude Desktop or Claude Code CLI with automatic x402 payments

## Features

### Available Tools
1. **compile_solidity** - Solidity compilation (0.01 USDC)
2. **analyze_with_slither** - Security analysis (0.02 USDC)
3. **compile_and_deploy** - Single network deployment (dynamic pricing)
4. **compile_and_deploy_multi_network** - Multi-network deployment (dynamic pricing)

### Technical Features
- **x402 Payment Protocol**: On-chain settlement verification before service execution
- **USDC Payments**: EIP-3009 `TransferWithAuthorization` for gasless approvals
- **Delegated Deployment**: Server deploys contracts without requiring client private keys
- **Dynamic Gas Pricing**: Fair, transparent gas-based pricing for deployments
- **MCP Integration**: Built with Ampersend SDK for seamless payment-gated tools
- **Bazaar Discovery**: Indexed on [agentic.market](https://agentic.market) with full metadata for AI agent discovery

## Architecture

### Server Implementation
Modular MCP server implementation with payment-gated tools:
- `src/server/` - Organized server architecture
  - `index.ts` - Main entry point
  - `discovery.ts` - Bazaar discovery HTTP server
  - `tools/` - Individual MCP tools
    - `compile-solidity.ts` - Solidity compilation
    - `analyze-slither.ts` - Security analysis via Slither
    - `compile-deploy.ts` - Delegated deployment with dynamic gas-based pricing
    - `compile-deploy-multi.ts` - Multi-network deployment support
  - `utils/` - Shared utilities
    - `payment.ts` - Payment verification utilities
  - `config/` - Configuration management
    - `network.ts` - Centralized network configuration for easy mainnet/testnet switching
    - `tools.ts` - Central tool configuration (compiler versions, pricing, gas settings)
    - `bazaar.ts` - Bazaar discovery metadata for all tools
- Verifies X402 payments on-chain before executing tools
- Integrates with Remix API for Slither analysis
- Provides Delegated Deployment Service for secure contract deployment
- Exposes discovery endpoint for x402 Bazaar indexing
- See `REFACTORING_SUMMARY.md` for detailed refactoring documentation

### Testing & Examples
- `src/lib/` - Client SDK (included for testing and examples)
- `src/examples/` - Example client implementations
- `tests/e2e/` - End-to-end integration tests

## Installation

```bash
# Install dependencies
yarn install
```

## Configuration

### Server Configuration

 Most configuration values now have defaults in `src/server/config/tools.ts`. You only need to set:
- `SERVER_DEPLOYER_PRIVATE_KEY` (required for deployment service)
- `PAY_TO_ADDRESS` (required for receiving payments)

### Tool Configuration

All tool settings are centralized in `src/server/config/tools.ts`:
- Default compiler version (currently v0.8.35+commit.47b9dedd)
  - Note: Users can specify custom versions via the `version` parameter
- EVM version (currently osaka)
- Pricing for each tool
- Gas estimation parameters
- Service fees and buffers
- Default network and RPC URLs

## Building

```bash
# Build TypeScript files
yarn run build
```

## Running the Server

### Start the MCP Server

```bash
# Build and start the server
yarn build && yarn start
```

The server will start:
- **MCP Server**: `http://localhost:8000/mcp` - Main MCP endpoint for tool execution
- **Discovery Server**: `http://localhost:8001/discovery` - Bazaar discovery metadata endpoint

### Discovery Endpoint

The discovery endpoint exposes metadata for all tools in a format compatible with the x402 Bazaar:

```bash
# View discovery metadata
curl http://localhost:8001/discovery
```

This endpoint is used by:
- **agentic.market** - To index and validate your service
- **CDP Facilitator** - To automatically catalog your tools
- **AI agents** - To discover available tools and their capabilities

## Testing

### E2E Tests

End-to-end tests verify the complete payment and tool execution flow with real blockchain transactions.

**Prerequisites:**
- MCP server must be running
- Test wallet funded with USDC on Base Sepolia
- Configure `.env.test` or `.env` with test wallet

**Run tests:**
```bash
# Run all E2E tests
yarn test

# Watch mode
yarn test:watch

# Verbose output
yarn test:verbose
```

**Test coverage:**
- ✅ Compilation with automatic payment
- ✅ Custom compiler settings
- ✅ Multiple files with imports
- ✅ Security analysis with Slither
- ✅ Contract deployment
- ✅ Multi-network deployment
- ✅ Payment flow verification

### Example Clients

Example client implementations are provided in `src/examples/` for testing and reference:

## x402 Payment Flow

The server implements the x402 protocol for pay-per-use services:

```
Client                          Server
  |                               |
  |---(1) Request Tool----------->|
  |                               |
  |<--(2) 402 Payment Required----|
  |    (amount, USDC address)     |
  |                               |
  |---(3) Create Authorization--->|
  |    (EIP-712 signature)        |
  |                               |
  |---(4) Settle On-Chain-------->| (Blockchain)
  |    (executes USDC transfer)   |
  |                               |
  |---(5) Re-request with Proof-->|
  |                               |
  |                      (6) Verify Settlement
  |                       (reads blockchain)
  |                               |
  |<--(7) Execute & Return--------|
```

**Key Points:**
- Payment verified on-chain before service execution
- EIP-3009 for gasless USDC approvals
- Dynamic pricing for deployment tools based on actual gas costs
- Transparent pricing: clients see exact costs before payment

> 📖 **For detailed usage examples and tool specifications, see [USAGE.md](USAGE.md) and [API_REFERENCE.md](API_REFERENCE.md)**

## Bazaar Discovery & Indexing

This server is compatible with the **x402 Bazaar** discovery layer, making it discoverable on [agentic.market](https://agentic.market) and by AI agents.

### Discovery Metadata

The server exposes structured metadata at `http://localhost:8001/discovery` that includes:
- **Tool specifications** - Input/output schemas with JSON Schema validation
- **Pricing information** - Exact costs for each tool
- **Payment requirements** - Network, USDC address, and payment scheme
- **Service descriptions** - Natural language descriptions for semantic search
- **Examples** - Sample inputs and outputs for each tool

### How Discovery Works

1. **Automatic Indexing**: Once you make a successful payment through the CDP Facilitator, your service is automatically cataloged
2. **No Registration Required**: The CDP Facilitator extracts metadata from the `/discovery` endpoint
3. **Searchable by AI Agents**: Services indexed on the Bazaar can be discovered by AI agents using semantic search
4. **Quality Signals**: Your service visibility improves based on usage and quality

### Validation

To validate your endpoint is properly configured for the Bazaar:

1. **Start the server**: `yarn build && yarn start`
2. **Visit the validator**: Go to [https://agentic.market/validate](https://agentic.market/validate)
3. **Enter your endpoint**: Use your public URL (e.g., `https://your-domain.com/discovery`)
4. **Check results**: The validator will verify metadata format and indexing requirements

### Environment Variables for Discovery

Optional configuration for the discovery endpoint:

```bash
# Server base URL for resource identifiers (default: http://localhost:8000)
SERVER_BASE_URL=https://your-domain.com

# Discovery server port (default: 8001)
DISCOVERY_PORT=8001

# Payment receiving address (required for proper metadata)
PAY_TO_ADDRESS=0xYourAddress
```

## Network Details

- **Network**: Base Sepolia
- **Chain ID**: 84532
- **USDC Contract**: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- **RPC**: `https://sepolia.base.org`

## Links

- [x402 Protocol](https://github.com/ampersand-ai/x402)
- [Ampersend SDK](https://github.com/ampersand-ai/ampersend-sdk)
- [EIP-3009 Specification](https://eips.ethereum.org/EIPS/eip-3009)
- [Slither Documentation](https://github.com/crytic/slither)
- [Remix IDE](https://remix.ethereum.org)
