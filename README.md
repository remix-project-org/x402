# x402 MCP Server

An MCP (Model Context Protocol) server implementing the x402 payment protocol for paid Solidity development tools using USDC on Base networks (Sepolia testnet and mainnet).

## Overview

This is a **server-side implementation** of an x402-enabled MCP server that provides paid Solidity development tools. The server:
- **Verifies x402 payment settlements** on-chain before providing services
- **Provides Solidity compilation**, security analysis, and deployment services
- **Uses USDC payments** via EIP-3009 `TransferWithAuthorization`
- **Operates a delegated deployment service** where the server deploys contracts on behalf of clients

## Features

- **Paid Solidity Compilation**: Compile Solidity contracts using Remix compiler (0.01 USDC)
- **Paid Slither Analysis**: Security analysis of Solidity contracts using Slither (0.02 USDC)
- **Delegated Deployment Service**: Deploy contracts without sharing private keys
  - Dynamic gas-based pricing + 0.05 USDC base fee
  - Gas estimation before payment (deployment + optional method call)
  - Pricing: Gas cost + 30% service fee + 0.05 USDC base fee
  - Optional post-deployment method calls
  - Automatic transaction handling and verification
- **x402 Payment Protocol**: Fully compliant implementation with on-chain settlement verification
- **USDC Payments**: ERC-20 token payments on Base networks (Sepolia testnet and mainnet)
- **Custom Wallet**: EIP-712 signature implementation for USDC compatibility
- **MCP Integration**: Built with Ampersend SDK for seamless payment-gated tools

📖 **[View detailed tool usage and API documentation →](USAGE.md)**

## Architecture

### Server Implementation
Modular MCP server implementation with payment-gated tools:
- `src/server/` - Organized server architecture
  - `index.ts` - Main entry point (36 lines)
  - `tools/` - Individual MCP tools
    - `compile-solidity.ts` - Solidity compilation (83 lines)
    - `analyze-slither.ts` - Security analysis via Slither (177 lines)
    - `compile-deploy.ts` - Delegated deployment with dynamic gas-based pricing (320+ lines)
    - `compile-deploy-multi.ts` - Multi-network deployment support
  - `utils/` - Shared utilities
    - `payment.ts` - Payment verification utilities (70 lines)
  - `config/` - Configuration management
    - `network.ts` - Centralized network configuration for easy mainnet/testnet switching
    - `tools.ts` - Central tool configuration (compiler versions, pricing, gas settings)
- Verifies X402 payments on-chain before executing tools
- Integrates with Remix API for Slither analysis
- Provides Delegated Deployment Service for secure contract deployment
- See `REFACTORING_SUMMARY.md` for detailed refactoring documentation

### Testing & Examples
- `src/lib/` - Client SDK (included for testing and examples)
- `src/examples/` - Example client implementations
- `tests/e2e/` - End-to-end integration tests

## Prerequisites

- Node.js (v18 or higher)
- A funded wallet for the server's deployment service (BASE tokens for gas)
- An address to receive USDC payments

## Installation

```bash
# Install dependencies
yarn install

# or
yarn install
```

## Configuration

### Server Configuration

 Most configuration values now have defaults in `src/server/config/tools.ts`. You only need to set:
- `SERVER_DEPLOYER_PRIVATE_KEY` (required for deployment service)
- `PAY_TO_ADDRESS` (required for receiving payments)

### Tool Configuration

All tool settings are centralized in `src/server/config/tools.ts`:
- Compiler versions (currently v0.8.35)
- EVM version (currently osaka)
- Pricing for each tool
- Gas estimation parameters
- Service fees and buffers
- Default network and RPC URLs

## Building

```bash
# Build TypeScript files
yarn run build

# or
yarn build
```

## Running the Server

### Start the MCP Server

```bash
# Build and start the server
yarn build && yarn start
```

The server will start on `http://localhost:8000/mcp`

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

## Server Payment Flow

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

## Tools Available

> 💡 **For complete tool documentation with request/response examples, see [USAGE.md](USAGE.md)**

### compile_solidity

Compiles Solidity contracts using the Remix compiler.

**Payment Required**: 0.01 USDC (10000 with 6 decimals)

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

**Payment Required**: 0.02 USDC (20000 with 6 decimals)

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

### compile_and_deploy

Compiles and deploys Solidity contracts using the server's Delegated Deployment Service (DDS). Optionally call a contract method immediately after deployment. Uses dynamic gas-based pricing for fair and transparent costs.

**Payment Required**: Dynamic based on gas estimation + base service fee
- Server compiles contract and estimates deployment gas
- If post-deployment call specified:
  - Predicts contract address using account nonce
  - Estimates method call gas on predicted address
  - Adds to total gas estimate
- **Pricing Formula**:
  ```
  Gas Cost = (Total Gas × Gas Price × 1.2 buffer) × ETH/USD
  Service Fee = Gas Cost × 30%
  Base Fee = 0.05 USDC
  Total = Gas Cost + Service Fee + Base Fee
  ```
- Base service fee of 0.05 USDC is always added
- Falls back to 0.05 USDC if estimation fails
- If method call estimation fails, uses 150k gas conservative estimate

**Security**: Client never shares private keys. Server uses its own funded wallet for deployment.

**Parameters**:
- `sources`: Object with contract filenames as keys and their content
- `contractName`: Name of the contract to deploy (e.g., "SimpleStorage")
- `contractFile`: Filename containing the contract (e.g., "SimpleStorage.sol")
- `constructorArgs` (optional): Array of constructor arguments
- `settings` (optional): Compiler settings (optimizer, evmVersion)
- `network`: Target network ("base-sepolia", "base", "avalanche-fuji", etc.)
- `postDeploymentCall` (optional): Method to call after deployment
  - `methodName`: Name of the method to call
  - `methodArgs`: Array of arguments for the method

**Returns (without post-deployment call)**:
```javascript
{
  "success": true,
  "compilation": {
    "warnings": []
  },
  "deployment": {
    "success": true,
    "contractAddress": "0x...",
    "transactionHash": "0x...",
    "blockNumber": "12345",
    "gasUsed": "500000",
    "network": "base-sepolia",
    "deployedBy": "server-delegated-deployer",
    "deployerAddress": "0x..."
  },
  "abi": [...]
}
```

**Returns (with successful post-deployment call)**:
```javascript
{
  "success": true,
  "compilation": { "warnings": [] },
  "deployment": {
    "success": true,
    "contractAddress": "0x...",
    "transactionHash": "0x...",
    ...
  },
  "postDeploymentCall": {
    "success": true,
    "methodName": "initialize",
    "methodArgs": [100],
    "transactionHash": "0x...",
    "blockNumber": "12346",
    "gasUsed": "50000",
    "status": "success"
  },
  "abi": [...]
}
```

**Returns (deployment successful, method call failed)**:
```javascript
{
  "success": false,
  "message": "Contract deployed successfully at 0x..., but post-deployment method call failed",
  "compilation": { "warnings": [] },
  "deployment": {
    "success": true,
    "contractAddress": "0x...",
    "transactionHash": "0x...",
    ...
  },
  "postDeploymentCall": {
    "success": false,
    "methodName": "initialize",
    "methodArgs": [100],
    "error": "execution reverted: ...",
    "details": "..."
  },
  "abi": [...]
}
```

**Example (deploy only)**:
```javascript
{
  sources: {
    "SimpleStorage.sol": {
      content: "contract SimpleStorage { ... }"
    }
  },
  contractName: "SimpleStorage",
  contractFile: "SimpleStorage.sol",
  constructorArgs: [42],
  network: "base-sepolia"
}
```

**Example (deploy and call method)**:
```javascript
{
  sources: {
    "SimpleStorage.sol": {
      content: "contract SimpleStorage { ... }"
    }
  },
  contractName: "SimpleStorage",
  contractFile: "SimpleStorage.sol",
  constructorArgs: [42],
  network: "base-sepolia",
  postDeploymentCall: {
    methodName: "set",
    methodArgs: [100]
  }
}
```

**How it works**:
1. Server estimates gas cost and calculates total payment required
2. Client pays dynamic amount via X402
3. Server verifies payment on-chain
4. Server compiles the contract
5. Server deploys using its own wallet (SERVER_DEPLOYER_PRIVATE_KEY)
6. (Optional) Server calls the specified method on the deployed contract
7. Server pays all gas fees (covered by client payment)
8. Server returns contract address, deployment details, and method call results

**Flow and Error Handling**:
- If gas estimation fails → falls back to default 0.05 USDC
- If compilation fails → deployment does not proceed
- If deployment fails → method call does not proceed
- If method call fails → deployment details are still returned with clear error message
- All transaction details (hashes, gas used, block numbers) are included in the response

**Dynamic Pricing Benefits**:
- Pay only for actual gas used (fair pricing based on real costs)
- Automatic adjustment based on network gas prices
- Transparent gas estimation shown before payment
- 20% buffer ensures transaction won't fail due to gas price fluctuations
- 30% service fee on gas costs covers operational overhead
- 0.05 USDC base fee ensures service viability for all deployments

## Network Details

- **Network**: Base Sepolia
- **Chain ID**: 84532
- **USDC Contract**: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- **RPC**: `https://sepolia.base.org`

```

## Links

- [x402 Protocol](https://github.com/ampersand-ai/x402)
- [Ampersend SDK](https://github.com/ampersand-ai/ampersend-sdk)
- [EIP-3009 Specification](https://eips.ethereum.org/EIPS/eip-3009)
- [Slither Documentation](https://github.com/crytic/slither)
- [Remix IDE](https://remix.ethereum.org)
