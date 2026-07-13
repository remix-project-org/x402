# Remix x402 Server

A complete x402 payment protocol server providing paid Solidity development tools using USDC on Base networks (Sepolia testnet and mainnet).

## Overview

This is a **multi-protocol server implementation** that provides paid Solidity development tools through:
- **MCP Server** (`/mcp`) - Model Context Protocol for AI agents like Claude
- **HTTP x402 Server** (`/compile`, `/analyze`) - Standard HTTP REST endpoints with x402 payment protocol
- **Discovery Server** (`/discovery`) - Service metadata for Bazaar indexing and AI agent discovery

**Key Capabilities:**
- **Verifies x402 payment settlements** on-chain before providing services
- **Provides Solidity compilation**, security analysis, and deployment services
- **Uses USDC payments** via EIP-3009 `TransferWithAuthorization`
- **Facilitator-based settlement** (HTTP x402 server only) - clients don't pay gas fees
- **Operates delegated deployment service** where the server deploys contracts on behalf of clients

## Quick Links

### 📖 Usage Guides - Choose Your Server Type

**For AI Agents (Claude, etc.):**
- 📱 **[MCP Server Usage Guide →](MCP_USAGE.md)**
  - Model Context Protocol for AI agents
  - Ampersend SDK payment handling
  - Claude Desktop/CLI integration
  - Clients pay gas fees

**For Web Applications & REST APIs:**
- 🌐 **[HTTP x402 Server Usage Guide →](HTTP_X402_USAGE.md)**
  - Standard HTTP REST endpoints
  - Facilitator-based payment settlement
  - **No gas fees for clients!** ✅
  - Production-ready with CDP

### 📚 Reference Documentation
- 🖥️ **[Claude Setup Guide](CLAUDE_SETUP.md)** - Connect to Claude Desktop or Claude Code CLI
- 📘 **[API Reference](API_REFERENCE.md)** - Complete API specs for all 4 tools
- 🔧 **[HTTP Endpoints](HTTP_X402_ENDPOINTS.md)** - HTTP x402 endpoint specifications

## Which Server Should I Use?

| Feature | MCP Server | HTTP x402 Server |
|---------|-----------|------------------|
| **Best for** | AI agents (Claude) | Web apps, APIs |
| **Protocol** | MCP | HTTP REST |
| **Endpoints** | `/mcp` | `/compile`, `/analyze` |
| **Payment Library** | Ampersend SDK | @x402/fetch |
| **Gas Fees** | Client pays | Facilitator pays ✅ |
| **Facilitator** | Not used | CDP or x402.org |
| **Setup** | [MCP_USAGE.md](MCP_USAGE.md) | [HTTP_X402_USAGE.md](HTTP_X402_USAGE.md) |

**Choose MCP** if you're integrating with Claude Desktop/CLI or building AI agents.
**Choose HTTP** if you're building web applications or want NO gas fees for clients.

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

Required environment variables:
- `SERVER_DEPLOYER_PRIVATE_KEY` - Required for deployment service
- `PAY_TO_ADDRESS` - Required for receiving payments

Optional (for HTTP x402 server with CDP Facilitator):
- `CDP_API_KEY_ID` - CDP API key for facilitator service
- `CDP_API_KEY_SECRET` - CDP API secret

> **Detailed configuration guides:**
> - HTTP x402 Server: See [HTTP_X402_USAGE.md](HTTP_X402_USAGE.md) for facilitator configuration
> - MCP Server: See [MCP_USAGE.md](MCP_USAGE.md) for wallet setup

## Building

```bash
# Build TypeScript files
yarn run build
```

## Running the Server

### Start the Server

```bash
# Build and start the server
yarn build && yarn start
```

The server will start:
- **MCP Server**: `http://localhost:8000/mcp` - Main MCP endpoint for tool execution
- **Discovery Server**: `http://localhost:8001/discovery` - Bazaar discovery metadata endpoint
- **HTTP x402 Server** (optional): `http://localhost:8002` - REST endpoints with x402 protocol (requires `PAY_TO_ADDRESS`)

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

## Payment Protocol

This server supports two payment methods depending on which server you use:

### MCP Server Payment
- **Protocol**: Ampersend SDK
- **Settlement**: Client-side
- **Gas fees**: Paid by client
- **Best for**: AI agents, Claude integration

### HTTP x402 Server Payment
- **Protocol**: x402 with Facilitator service
- **Settlement**: Server-side via facilitator
- **Gas fees**: Paid by facilitator (NOT client!)
- **Best for**: Web applications, REST APIs

> 📖 **Detailed payment flows:**
> - [MCP_USAGE.md](MCP_USAGE.md) - MCP server payment flow
> - [HTTP_X402_USAGE.md](HTTP_X402_USAGE.md) - HTTP server with facilitator
> - [API_REFERENCE.md](API_REFERENCE.md) - Complete API specifications

## Bazaar Discovery & Indexing

This server is compatible with the **x402 Bazaar** discovery layer, making it discoverable on [agentic.market](https://agentic.market) and by AI agents.

### Discovery Metadata

The server exposes structured metadata at `http://localhost:8001/discovery` that includes:
- **Tool specifications** - Input/output schemas with JSON Schema validation
- **Pricing information** - Exact costs for each tool
- **Payment requirements** - Network, USDC address, and payment scheme
- **Service descriptions** - Natural language descriptions for semantic search
- **Examples** - Sample inputs and outputs for each tool

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
