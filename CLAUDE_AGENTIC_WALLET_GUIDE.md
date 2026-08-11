# Using Coinbase Agentic Wallet with Claude Desktop & Claude Code

This comprehensive guide shows how to use the **@coinbase/payments-mcp** server with Claude Desktop and Claude Code to interact with payment-enabled Remix project compilation and analysis endpoints services.

## Table of Contents
- [What is @coinbase/payments-mcp?](#what-is-coinbasepayments-mcp)
- [Prerequisites](#prerequisites)
- [Installation & Setup](#installation--setup)
  - [Claude Desktop Setup](#claude-desktop-setup)
  - [Claude Code Setup](#claude-code-setup)
- [Authentication](#authentication)
- [Using Remix.live Services](#using-remixlive-services)
  - [Compile Solidity Contracts](#compile-solidity-contracts)
  - [Analyze Contracts with Slither](#analyze-contracts-with-slither)
- [Available MCP Tools](#available-mcp-tools)
- [Wallet Management](#wallet-management)
- [Troubleshooting](#troubleshooting)

## What is @coinbase/payments-mcp?

The **@coinbase/payments-mcp** is a Model Context Protocol (MCP) server that enables AI agents like Claude to:
- Make payments using USDC on Base network
- Access pay-per-use APIs (x402 protocol services)
- Manage a Coinbase wallet through natural language
- Browse and discover services on the x402 Bazaar marketplace

**Key Benefits:**
- **No Private Key Management**: Wallet keys are securely stored by Coinbase
- **Email Authentication**: Sign in using one-time passcodes (no passwords)
- **Gasless Payments**: No gas fees for USDC payments
- **AI-Native**: Designed specifically for AI agent interactions
- **Built-in Safety**: Spending limits, KYT screening, and OFAC compliance

## Prerequisites

Before you begin, ensure you have:
- **Claude Desktop** (for desktop usage) OR **Claude Code CLI** (for terminal usage)
- **Node.js** 18+ installed
- **An email address** for authentication
- **USDC on Base network** for payments (can start with testnet)

## Installation & Setup

### Claude Desktop Setup

#### Method 1: Automatic Installation (Recommended)

1. **Run the Installer**

   ```bash
   npx @coinbase/payments-mcp
   ```

   This will start the interactive installer.

2. **Select Claude Desktop**

   When prompted, choose "Claude Desktop" from the list of MCP clients. The installer will automatically configure your Claude Desktop settings.

3. **Restart Claude Desktop**

   Quit Claude Desktop completely and restart it. The Agentic Wallet MCP will be ready to use.

#### Method 2: Manual Configuration

If the automatic installer fails, you can configure manually. 

Open your Claude Desktop configuration file, Add the following the MCP Server config file:

   ```json
   {
     "mcpServers": {
       "payments": {
         "command": "npx",
         "args": [
           "-y",
           "@coinbase/payments-mcp"
         ],
         "env": {
           "NETWORK": "base"
         }
       }
     }
   }
   ```

   **Network Options:**
   - `base` - Base Mainnet (production)
   - `base-sepolia` - Base Sepolia Testnet (for testing)

Quit Claude Desktop completely and restart it. The MCP server will initialize automatically.

#### Verify Installation

Check if the installation was successful:

```bash
npx @coinbase/payments-mcp status
```

#### Other Useful Commands

- **Reinstall**: `npx @coinbase/payments-mcp install --force`
- **Uninstall**: `npx @coinbase/payments-mcp uninstall`

### Claude Code Setup

**Option 1: Automatic Installation (Recommended)**
The easiest way is to use the npx installer with auto-configuration:

`npx @coinbase/payments-mcp --client claude-code --auto-config`

This will:

- Download and install the Payments MCP server
- Automatically configure it in your Claude Code settings
- Set up the necessary configuration files

**Option 2: Manual Installation**
If you prefer manual control, Install the MCP server:

`npx @coinbase/payments-mcp --client claude-code --no-auto-config`

Add the server to Claude Code:

`claude mcp add --transport stdio payments-mcp -- node /Users/YOUR_USERNAME/.payments-mcp/bundle.js`
(Replace YOUR_USERNAME with your actual home directory path)

**Option 3: Using the add-json Command**
You can also configure it directly using JSON:

`claude mcp add-json payments-mcp '{"type":"stdio","command":"node","args":["/Users/YOUR_USERNAME/.payments-mcp/bundle.js"]}'`

#### Verify Installation
Quit Claude code completely and restart it.

After installation, verify the server is configured:

`claude mcp list`

You should see `payments-mcp` in the list with its health status.

## Authentication

The first time you use the wallet, you'll need to authenticate:

### Sign In Flow

1. **Check Session Status**

   In Claude, simply ask:
   ```
   show me my wallet
   ```

   If not authenticated, Claude will automatically open the wallet interface.

2. **Email Authentication**

   When prompted:
   - Enter your email address
   - Check your email for a 6-digit verification code
   - Enter the code when prompted
   - Your wallet will be created automatically on first sign-in

3. **Verify Authentication**

   Once signed in, you can check your wallet:
   ```
   show me my wallet balance
   ```

### Session Management

- Sessions remain active across Claude sessions
- If authentication expires, Claude will prompt you to sign in again
- You can sign out at any time through the wallet interface

## Using Remix Project Services

Remix project provides Solidity development tools through the x402 Bazaar marketplace. Claude can discover and use these services automatically.

### Compile Solidity Contracts

**Cost**: $0.01 USDC per compilation

#### Example 1: Simple Storage Contract

Simply ask Claude:

```
compile a simple storage contract using remix.live services
```

Claude will:
1. Discover the Remix.live compile endpoint
2. Create a SimpleStorage contract
3. Pay $0.01 USDC automatically
4. Return the compiled bytecode and ABI

**The Contract:**
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract SimpleStorage {
    uint256 private storedData;

    function set(uint256 x) public {
        storedData = x;
    }

    function get() public view returns (uint256) {
        return storedData;
    }
}
```

#### Example 2: ERC20 Token Contract

```
compile an ERC20 token contract with the following features:
- Name: MyToken
- Symbol: MTK
- Initial supply: 1,000,000
- Mintable by owner
- Burnable
```

Claude will create and compile the contract using the Remix.live service.

#### Example 3: Custom Contract

You can also provide your own contract:

```
compile this contract using remix.live:

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Voting {
    mapping(address => bool) public hasVoted;
    mapping(uint256 => uint256) public votes;

    function vote(uint256 proposalId) public {
        require(!hasVoted[msg.sender], "Already voted");
        hasVoted[msg.sender] = true;
        votes[proposalId]++;
    }
}
```

#### Understanding the Response

The compilation service returns:
- **success**: Whether compilation succeeded
- **contracts**: Compiled contract data
  - **abi**: Contract ABI (for interacting with the contract)
  - **evm.bytecode.object**: Bytecode for deployment
- **version**: Solidity compiler version used
- **errors**: Any compilation errors or warnings

### Analyze Contracts with Slither

**Cost**: $0.02 USDC per analysis

Slither is a powerful static analysis tool that detects vulnerabilities and code quality issues.

#### Example 1: Analyze a Vulnerable Contract

```
analyze this contract for security vulnerabilities using remix.live:

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract VulnerableBank {
    mapping(address => uint256) public balances;

    function deposit() public payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw() public {
        uint256 amount = balances[msg.sender];
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");
        balances[msg.sender] = 0;  // Reentrancy vulnerability!
    }
}
```

Claude will:
1. Send the contract to Remix.live analyze endpoint
2. Pay $0.02 USDC automatically
3. Return Slither's security analysis
4. Explain the vulnerabilities found (like the reentrancy issue)


## Wallet Management

### Checking Your Balance

```
what's my USDC balance?
```

Response example:
```
Your wallet balance on Base:
- USDC: 10.00 USDC
- ETH: 0.005 ETH
```

### Getting Your Wallet Address

```
what's my wallet address?
```

Response example:
```
Your wallet addresses:
- Base (EVM): 0x1234567890abcdef1234567890abcdef12345678
- Solana: AbC123...xyz
```

### Adding Funds

1. Get your wallet address (see above)
2. Send USDC on Base network to that address
3. Verify receipt: "check my balance"

### Spending Limits

The wallet has built-in spending limits for security. These are configured on the Coinbase side and help prevent unauthorized large transactions.

### Getting Help

If you continue to have issues:
- Check the [Coinbase Agentic Wallet docs](https://docs.cdp.coinbase.com/agentic-wallet/docs/welcome)
- Review the [x402 protocol documentation](https://docs.x402.org)
- Contact Coinbase support for wallet-specific issues

## Example Workflows

### Workflow 1: Compile and Deploy

```
1. compile a simple ERC20 token using remix.live
2. analyze it for security issues
3. if it's safe, show me the deployment bytecode
```

### Workflow 2: Security Audit

```
I have this contract [paste contract code].
Please:
1. compile it using remix.live
2. run security analysis
3. summarize the vulnerabilities found
4. suggest fixes
```

### Workflow 3: Learning Smart Contracts

```
create a simple voting contract and:
1. compile it with remix.live
2. explain the bytecode structure
3. analyze it for any issues
4. suggest improvements
```

## Cost Summary

| Service | Endpoint | Cost | Description |
|---------|----------|------|-------------|
| Compile | api.remix.live/mcp/x402-http/compile | $0.01 USDC | Solidity compilation |
| Analyze | api.remix.live/mcp/x402-http/analyze | $0.02 USDC | Slither security analysis |

**Note**: No gas fees! Payments use the facilitator model where gas is covered by the service.

## Related Documentation

- **[Agentic Wallet CLI Guide](AGENTIC_WALLET_INTEGRATION.md)** - Use the wallet from command line
- **[HTTP x402 Endpoints](HTTP_X402_ENDPOINTS.md)** - Direct API usage
- **[MCP Usage Guide](MCP_USAGE.md)** - Using the MCP server programmatically
- **[API Reference](API_REFERENCE.md)** - Complete API specifications


