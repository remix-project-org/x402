# Quick Start Guide

## Project Structure (Organized)

```
src/
├── client/      🔧 SDK library (treasurer, wallets, transport)
├── examples/    📁 Working examples for each tool
└── server/      🖥️ MCP server with payment-gated tools
```

## Quick Commands

### Server Operations
```bash
yarn run build    # Compile TypeScript
yarn start        # Start MCP server
yarn run dev      # Development mode
```

### Examples
```bash
yarn run examples          # List all examples
yarn run example:compile   # Compile Solidity (0.01 USDC)
yarn run example:slither   # Security analysis (0.02 USDC)
yarn run example:deploy    # Deploy contract (0.05 USDC)
```

## Available Tools

| Tool | Price | Description |
|------|-------|-------------|
| `compile_solidity` | 0.01 USDC | Compile Solidity contracts |
| `analyze_with_slither` | 0.02 USDC | Security analysis via Slither |
| `compile_and_deploy` | 0.05 USDC | Compile & deploy (DDS) |

## Configuration

Edit `.env`:
```bash
PRIVATE_KEY=0x...                    # Client wallet
PAY_TO_ADDRESS=0x...                 # Payment recipient
SERVER_DEPLOYER_PRIVATE_KEY=0x...    # Server deployer (for DDS)
```

## Common Tasks

### Add a New Example
1. Create: `src/examples/feature.js`
2. Add script: `"example:feature": "node src/examples/feature.js"`
3. Update: `src/examples/index.js`
4. Document: `src/examples/README.md`

### Add a New Tool
1. Edit: `src/server/index.ts`
2. Create example: `src/examples/tool-name.js`
3. Update docs: `README.md`

## Architecture

```
Example (src/examples/)
    ↓
Client SDK (src/client/)
    ↓
MCP Server (src/server/)
    ↓
Blockchain (payment verification)
```

## Payment Flow

1. Example calls tool via SDK
2. SDK creates X402 payment authorization
3. SDK settles payment on-chain
4. Server verifies settlement
5. Server executes tool
6. Results returned to example

## Documentation

- **Main README**: `/README.md` - Complete project documentation
- **Source README**: `/src/README.md` - Source code organization
- **Examples README**: `/src/examples/README.md` - Examples guide
- **Structure**: `/PROJECT_STRUCTURE.md` - Detailed structure info

## Support

- Issues: https://github.com/anthropics/claude-code/issues
- X402 Protocol: https://github.com/ampersand-ai/x402
- Ampersend SDK: https://github.com/ampersand-ai/ampersend-sdk
