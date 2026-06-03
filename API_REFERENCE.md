# API Reference

This document provides detailed API specifications for all tools available on the Remix x402 MCP Server.

## Table of Contents

1. [compile_solidity](#1-compile_solidity)
2. [analyze_with_slither](#2-analyze_with_slither)
3. [compile_and_deploy](#3-compile_and_deploy)
4. [compile_and_deploy_multi_network](#4-compile_and_deploy_multi_network)

---

## 1. compile_solidity

Compile Solidity smart contracts using the Remix compiler.

**Price:** 0.01 USDC

### Input Parameters

```typescript
{
  sources: {
    [filename: string]: {
      content: string
    }
  },
  version?: string,
  settings?: {
    optimizer?: {
      enabled: boolean,
      runs: number
    },
    evmVersion?: string
  }
}
```

#### Parameters Description

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sources` | Object | Yes | Map of filename to source code content |
| `sources[filename].content` | string | Yes | Solidity source code |
| `version` | string | No | Solidity compiler version (e.g., "v0.8.20+commit.a1b79de6") (default: "v0.8.35+commit.47b9dedd") |
| `settings` | Object | No | Compiler settings |
| `settings.optimizer` | Object | No | Optimizer configuration |
| `settings.optimizer.enabled` | boolean | No | Enable optimizer (default: false) |
| `settings.optimizer.runs` | number | No | Optimizer runs (default: 200) |
| `settings.evmVersion` | string | No | EVM version (default: "osaka") |

#### Supported EVM Versions

- `homestead`
- `tangerineWhistle`
- `spuriousDragon`
- `byzantium`
- `constantinople`
- `petersburg`
- `istanbul`
- `berlin`
- `london`
- `paris` (default)
- `shanghai`

### Output

```typescript
{
  success: boolean,
  contracts?: {
    [filename: string]: {
      [contractName: string]: {
        abi: Array<Object>,
        evm: {
          bytecode: {
            object: string,
            opcodes: string,
            sourceMap: string,
            linkReferences: Object
          },
          deployedBytecode: {
            object: string,
            opcodes: string,
            sourceMap: string,
            linkReferences: Object
          },
          methodIdentifiers: Object,
          gasEstimates: Object
        },
        metadata: string
      }
    }
  },
  sources?: {
    [filename: string]: {
      id: number,
      ast: Object
    }
  },
  errors?: Array<{
    severity: "error" | "warning",
    message: string,
    formattedMessage: string,
    sourceLocation?: {
      file: string,
      start: number,
      end: number
    }
  }>,
  settings?: {
    optimizer: {
      enabled: boolean,
      runs: number
    },
    evmVersion: string
  },
  version?: string
}
```

#### Output Fields Description

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Whether compilation succeeded |
| `contracts` | Object | Compiled contracts by file and contract name (only if successful) |
| `contracts[file][name].abi` | Array | Contract ABI (Application Binary Interface) |
| `contracts[file][name].evm.bytecode` | Object | Contract creation bytecode |
| `contracts[file][name].evm.deployedBytecode` | Object | Runtime bytecode |
| `contracts[file][name].evm.methodIdentifiers` | Object | Function signature hashes |
| `contracts[file][name].evm.gasEstimates` | Object | Gas cost estimates |
| `contracts[file][name].metadata` | string | Contract metadata JSON |
| `sources` | Object | Source file information with AST (only if successful) |
| `errors` | Array | Compilation errors and warnings (if any) |
| `settings` | Object | Compiler settings used (only if successful) |
| `version` | string | Solidity compiler version used |

### Example

```javascript
const result = await client.callTool({
  name: "compile_solidity",
  arguments: {
    sources: {
      "MyToken.sol": {
        content: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MyToken {
    string public name = "MyToken";
    mapping(address => uint256) public balances;

    function mint(address to, uint256 amount) public {
        balances[to] += amount;
    }
}
        `
      }
    },
    version: "v0.8.20+commit.a1b79de6", // Optional: specify compiler version
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      evmVersion: "paris"
    }
  }
});

const output = JSON.parse(result.content[0].text);
console.log('Compiler version:', output.version);
console.log('ABI:', output.contracts['MyToken.sol'].MyToken.abi);
console.log('Bytecode:', output.contracts['MyToken.sol'].MyToken.evm.bytecode.object);
```

---

## 2. analyze_with_slither

Run static security analysis on Solidity contracts using Slither.

**Price:** 0.02 USDC

### Input Parameters

```typescript
{
  sources: {
    [filename: string]: {
      content: string
    }
  },
  version?: string,
  detectors?: Array<string>,
  excludeLow?: boolean,
  excludeInformational?: boolean
}
```

#### Parameters Description

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sources` | Object | Yes | Map of filename to source code content |
| `sources[filename].content` | string | Yes | Solidity source code |
| `version` | string | No | Solidity compiler version (e.g., "0.8.35") |
| `detectors` | Array<string> | No | Specific Slither detectors to run |
| `excludeLow` | boolean | No | Exclude low severity findings (default: false) |
| `excludeInformational` | boolean | No | Exclude informational findings (default: false) |

#### Common Slither Detectors

- `reentrancy-eth` - Reentrancy vulnerabilities
- `arbitrary-send-eth` - Unprotected ETH send
- `suicidal` - Unprotected self-destruct
- `uninitialized-state` - Uninitialized state variables
- `unchecked-transfer` - Unchecked return values
- `tx-origin` - Dangerous use of tx.origin
- `timestamp` - Timestamp dependency
- And many more...

### Output

```typescript
{
  success: boolean,
  summary?: {
    totalFindings: number,
    high: number,
    medium: number,
    low: number,
    informational: number,
    optimization: number
  },
  findings?: Array<{
    check: string,
    impact: "High" | "Medium" | "Low" | "Informational" | "Optimization",
    confidence: "High" | "Medium" | "Low",
    description: string,
    elements?: Array<{
      type: string,
      name: string,
      source_mapping?: {
        start: number,
        length: number,
        filename_relative: string,
        lines: Array<number>
      }
    }>,
    reference?: string,
    id?: string
  }>,
  rawAnalysis?: string,
  rawOutput?: Object,
  compilerVersion?: string,
  error?: string
}
```

#### Output Fields Description

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Whether analysis completed successfully |
| `summary` | Object | Summary counts by severity level |
| `findings` | Array | Array of security findings |
| `findings[].check` | string | Detector name that found the issue |
| `findings[].impact` | string | Severity level of the finding |
| `findings[].confidence` | string | Confidence level of the finding |
| `findings[].description` | string | Human-readable description |
| `findings[].elements` | Array | Code elements involved in the finding (if available) |
| `findings[].reference` | string | URL reference for more information |
| `rawAnalysis` | string | Raw Slither output text |
| `rawOutput` | Object | Complete Remix API response |
| `compilerVersion` | string | Solidity version used for analysis |
| `error` | string | Error message if analysis failed |

#### Impact Levels

- **High**: Critical vulnerabilities that should be fixed immediately
- **Medium**: Important issues that could lead to problems
- **Low**: Minor issues or code quality improvements
- **Informational**: Best practice suggestions

### Example

```javascript
const result = await client.callTool({
  name: "analyze_with_slither",
  arguments: {
    sources: {
      "Vulnerable.sol": {
        content: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Vulnerable {
    mapping(address => uint256) public balances;

    function withdraw() public {
        uint256 amount = balances[msg.sender];
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success);
        balances[msg.sender] = 0; // State change after external call!
    }
}
        `
      }
    },
    excludeInformational: true
  }
});

const output = JSON.parse(result.content[0].text);
console.log('Summary:', output.summary);
output.findings.forEach(finding => {
  console.log(`[${finding.impact}] ${finding.check}: ${finding.description}`);
});
```

---

## 3. compile_and_deploy

Compile and deploy a smart contract to a single network using the server's delegated deployment service.

**Price:** Dynamic - `(Gas Cost × 1.3) + 0.05 USDC`

### Input Parameters

```typescript
{
  sources: {
    [filename: string]: {
      content: string
    }
  },
  contractName: string,
  contractFile: string,
  network: string,
  constructorArgs?: Array<any>,
  version?: string,
  settings?: {
    optimizer?: {
      enabled: boolean,
      runs: number
    },
    evmVersion?: string
  },
  value?: string,
  postDeploymentCall?: {
    methodName: string,
    methodArgs?: Array<any>,
    value?: string
  }
}
```

#### Parameters Description

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sources` | Object | Yes | Map of filename to source code content |
| `contractName` | string | Yes | Name of the contract to deploy |
| `contractFile` | string | Yes | Filename containing the contract |
| `network` | string | Yes | Network to deploy to (any network supported by viem/chains) |
| `constructorArgs` | Array | No | Constructor arguments for the contract |
| `version` | string | No | Solidity compiler version (e.g., "v0.8.20+commit.a1b79de6") (default: "v0.8.35+commit.47b9dedd") |
| `settings` | Object | No | Compiler settings (same as compile_solidity) |
| `value` | string | No | Value in wei to send with deployment (for payable constructors) |
| `postDeploymentCall` | Object | No | Optional method to call after deployment |
| `postDeploymentCall.methodName` | string | Yes | Name of method to call |
| `postDeploymentCall.methodArgs` | Array | No | Arguments for the method call |
| `postDeploymentCall.value` | string | No | Value in wei to send with method call (for payable methods) |

#### Supported Networks

Currently on testnet:
- `base-sepolia` - Base Sepolia testnet (primary)
- `sepolia` - Ethereum Sepolia testnet

Note: The tool supports any network from viem/chains. On mainnet launch, additional networks like `base`, `mainnet`, `polygon`, `arbitrum`, `optimism`, etc. will be available.

### Output

```typescript
{
  success: boolean,
  compilation?: {
    version: string,
    warnings: Array<any>,
    settings: {
      optimizer: {
        enabled: boolean,
        runs: number
      },
      evmVersion: string
    }
  },
  deployment?: {
    success: boolean,
    contractAddress: string,
    transactionHash: string,
    blockNumber: string,
    gasUsed: string,
    status: string,
    network: string,
    deployedBy: string,
    deployerAddress: string
  },
  abi?: Array<Object>,
  postDeploymentCall?: {
    success: boolean,
    methodName: string,
    methodArgs: Array<any>,
    transactionHash?: string,
    blockNumber?: string,
    gasUsed?: string,
    status?: string,
    error?: string,
    details?: string
  },
  message?: string,
  error?: string,
  details?: string
}
```

#### Output Fields Description

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Whether overall operation succeeded |
| `compilation` | Object | Compilation warnings and settings used |
| `compilation.version` | string | Solidity compiler version used for compilation |
| `deployment` | Object | Deployment details and transaction info |
| `deployment.contractAddress` | string | Deployed contract address |
| `deployment.transactionHash` | string | Deployment transaction hash |
| `deployment.blockNumber` | string | Block number of deployment |
| `deployment.gasUsed` | string | Actual gas used for deployment |
| `deployment.status` | string | Transaction status |
| `deployment.network` | string | Network deployed to |
| `deployment.deployerAddress` | string | Server deployer address |
| `abi` | Array | Contract ABI for interaction |
| `postDeploymentCall` | Object | Result of post-deployment call (if any) |
| `postDeploymentCall.success` | boolean | Whether the method call succeeded |
| `postDeploymentCall.transactionHash` | string | Method call transaction hash |
| `postDeploymentCall.error` | string | Error if method call failed |
| `message` | string | Additional message (e.g., partial success) |
| `error` | string | Error message if operation failed |
| `details` | string | Stack trace or additional error details |

### Example

```javascript
const result = await client.callTool({
  name: "compile_and_deploy",
  arguments: {
    sources: {
      "Counter.sol": {
        content: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Counter {
    uint256 public count;
    address public owner;

    constructor(uint256 _initialCount) {
        count = _initialCount;
        owner = msg.sender;
    }

    function increment() public {
        count += 1;
    }
}
        `
      }
    },
    contractName: "Counter",
    contractFile: "Counter.sol",
    network: "base-sepolia",
    constructorArgs: [42],
    postDeploymentCall: {
      methodName: "increment",
      methodArgs: []
    }
  }
});

const output = JSON.parse(result.content[0].text);
console.log('Contract deployed at:', output.contractAddress);
console.log('Transaction:', output.transactionHash);
console.log('View on explorer: https://sepolia.basescan.org/address/' + output.contractAddress);
```

---

## 4. compile_and_deploy_multi_network

Compile once and deploy to multiple networks simultaneously.

**Price:** Dynamic - `(Total Gas Across Networks × 1.3) + 0.05 USDC + 10% multi-network buffer`

### Input Parameters

```typescript
{
  sources: {
    [filename: string]: {
      content: string
    }
  },
  contractName: string,
  contractFile: string,
  networks: Array<string>,
  constructorArgs?: Array<any>,
  version?: string,
  settings?: {
    optimizer?: {
      enabled: boolean,
      runs: number
    },
    evmVersion?: string
  },
  postDeploymentCall?: {
    methodName: string,
    methodArgs?: Array<any>
  }
}
```

#### Parameters Description

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sources` | Object | Yes | Map of filename to source code content |
| `contractName` | string | Yes | Name of the contract to deploy |
| `contractFile` | string | Yes | Filename containing the contract |
| `networks` | Array<string> | Yes | List of networks to deploy to |
| `constructorArgs` | Array | No | Constructor arguments (same for all networks) |
| `version` | string | No | Solidity compiler version (e.g., "v0.8.20+commit.a1b79de6") (default: "v0.8.35+commit.47b9dedd") |
| `settings` | Object | No | Compiler settings (same as compile_solidity) |
| `postDeploymentCall` | Object | No | Method to call after each deployment |

#### Supported Networks

Currently on testnet:
- `base-sepolia` - Base Sepolia testnet
- `sepolia` - Ethereum Sepolia testnet

Note: Any network from viem/chains is supported. More networks available on mainnet.

### Output

```typescript
{
  success: boolean,
  compilation?: {
    version: string,
    warnings: Array<any>
  },
  deployments: Array<{
    network: string,
    success: boolean,
    contractAddress?: string,
    transactionHash?: string,
    blockNumber?: string,
    gasUsed?: string,
    status?: string,
    deployedBy?: string,
    deployerAddress?: string,
    postDeploymentCall?: {
      success: boolean,
      methodName: string,
      transactionHash?: string,
      blockNumber?: string,
      gasUsed?: string,
      status?: string,
      error?: string
    },
    error?: string
  }>,
  abi?: Array<Object>,
  summary?: {
    total: number,
    successful: number,
    failed: number
  },
  error?: string,
  details?: string
}
```

#### Output Fields Description

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Whether all deployments succeeded |
| `compilation` | Object | Compilation warnings (compiled once) |
| `compilation.version` | string | Solidity compiler version used for compilation |
| `deployments` | Array | Array of deployment results per network |
| `deployments[].network` | string | Network name |
| `deployments[].success` | boolean | Whether this network deployment succeeded |
| `deployments[].contractAddress` | string | Deployed contract address on this network |
| `deployments[].transactionHash` | string | Deployment transaction hash |
| `deployments[].blockNumber` | string | Block number |
| `deployments[].gasUsed` | string | Gas used for deployment |
| `deployments[].postDeploymentCall` | Object | Post-deployment call result |
| `deployments[].error` | string | Error if this deployment failed |
| `abi` | Array | Contract ABI (same for all networks) |
| `summary` | Object | Summary statistics |
| `summary.total` | number | Total networks attempted |
| `summary.successful` | number | Number of successful deployments |
| `summary.failed` | number | Number of failed deployments |
| `error` | string | Overall error if entire operation failed |

### Example

```javascript
const result = await client.callTool({
  name: "compile_and_deploy_multi_network",
  arguments: {
    sources: {
      "NFT.sol": {
        content: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract SimpleNFT {
    string public name;
    string public symbol;
    uint256 public totalSupply;

    constructor(string memory _name, string memory _symbol) {
        name = _name;
        symbol = _symbol;
    }

    function mint(address to, uint256 tokenId) public {
        totalSupply += 1;
    }
}
        `
      }
    },
    contractName: "SimpleNFT",
    contractFile: "NFT.sol",
    networks: ["base-sepolia", "sepolia"],
    constructorArgs: ["MyNFT", "MNFT"],
    postDeploymentCall: {
      methodName: "mint",
      methodArgs: ["0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1", 1]
    }
  }
});

const output = JSON.parse(result.content[0].text);

console.log('Summary:', output.summary);

// Check results for each network
output.deployments.forEach(deployment => {
  if (deployment.success) {
    console.log(`${deployment.network}: ${deployment.contractAddress}`);
    console.log(`  Transaction: ${deployment.transactionHash}`);
  } else {
    console.log(`${deployment.network}: Failed - ${deployment.error}`);
  }
});
```

---

## Error Handling

All tools may return errors in various formats:

### Compilation Errors

```json
{
  "errors": [
    {
      "severity": "error",
      "message": "ParserError: Expected ';' but got 'identifier'",
      "formattedMessage": "ParserError: Expected ';' but got 'identifier'\n --> MyContract.sol:5:9:\n  |\n5 |     uint x\n  |         ^",
      "sourceLocation": {
        "file": "MyContract.sol",
        "start": 78,
        "end": 79
      }
    }
  ]
}
```

> **📖 Getting Started?**
> - For usage through Claude Desktop: **[CLAUDE_DESKTOP_SETUP.md](CLAUDE_DESKTOP_SETUP.md)**
> - For usage examples and guides: **[USAGE.md](USAGE.md)**


### Payment Errors

```json
{
  "error": "Insufficient USDC balance. Required: 0.01 USDC, Available: 0.005 USDC"
}
```

### Deployment Errors

```json
{
  "success": false,
  "error": "Contract deployment failed: execution reverted",
  "transactionHash": "0x..."
}
```

### Network Errors

```json
{
  "error": "Network not supported: ethereum-mainnet. Supported networks: base-sepolia, sepolia"
}
```

---

## Rate Limits

Currently, there are no rate limits enforced. However, please follow fair use guidelines:

- Don't spam requests
- Don't abuse the service with automated high-frequency calls
- For heavy usage, contact the team for enterprise pricing

---

## Best Practices

1. **Always test compilation first** before deploying
2. **Run Slither analysis** before deploying to catch security issues
3. **Start with small contracts** to understand costs
4. **Use optimizer** for production deployments to reduce gas costs
5. **Verify constructor arguments** carefully before deployment
6. **Check network carefully** - testnet tokens have no real value
7. **Save deployment addresses** - you'll need them to interact with contracts
8. **Test post-deployment calls** on single network before multi-network deployment

---

## Support

For issues, questions, or feature requests:
- **GitHub**: [github.com/remix-project-org/x402](https://github.com/remix-project-org/x402)
- **Documentation**: See README.md and USAGE.md
