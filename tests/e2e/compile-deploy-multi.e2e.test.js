import { describe, expect, it, beforeAll, afterAll, afterEach } from '@jest/globals';
import { createMCPClient } from '../../src/lib/index.js';
import { createPublicClient, http, parseAbi } from 'viem';
import { baseSepolia, sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

describe('Multi-Network Deployment E2E Tests', () => {
  let client, transport, wallet, publicClient, sepoliaPublicClient, expectedDeployerAddress;
  const serverUrl = process.env.MCP_SERVER_URL || 'http://localhost:8000/mcp';
  const payToAddress = process.env.PAY_TO_ADDRESS;
  const usdcAddress = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'; // Base Sepolia USDC

  // Derive the expected deployer address from the server's private key
  if (!process.env.SERVER_DEPLOYER_PRIVATE_KEY) {
    throw new Error('SERVER_DEPLOYER_PRIVATE_KEY environment variable is required for deployment tests');
  }
  const deployerAccount = privateKeyToAccount(process.env.SERVER_DEPLOYER_PRIVATE_KEY);
  expectedDeployerAddress = deployerAccount.address;

  beforeAll(async () => {
    console.log('\n🔌 Connecting to MCP server...');
    const mcpSetup = createMCPClient(serverUrl, {
      name: 'E2E-MultiDeploy-Test-Client',
      version: '1.0.0'
    });

    client = mcpSetup.client;
    transport = mcpSetup.transport;
    wallet = mcpSetup.wallet;

    // Create public clients for contract verification
    publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(),
    });

    sepoliaPublicClient = createPublicClient({
      chain: sepolia,
      transport: http(),
    });

    await client.connect(transport);
    console.log('✅ Connected to MCP server');
    console.log(`💼 Test wallet address: ${wallet.address}`);
    console.log(`💰 Payment recipient: ${payToAddress}`);
  });

  afterEach(async () => {
    // Wait between tests to allow blockchain transactions to settle
    // This prevents nonce conflicts in CI when tests run in quick succession
    // Sepolia has slower block times (12s) so we wait longer
    console.log('⏳ Waiting for transactions to settle...');
    await new Promise(resolve => setTimeout(resolve, 15000));
  });

  afterAll(async () => {
    if (client) {
      await client.close();
      console.log('\n👋 Disconnected from MCP server');
    }
  });

  describe('Single Network Deployment', () => {
    it('should deploy to single network using multi-network tool', async () => {
      console.log('\n🔧 Test: Deploying to single network (base-sepolia)...');

      const soliditySources = {
        "SimpleStorage.sol": {
          content: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract SimpleStorage {
    uint256 private value;

    event ValueChanged(uint256 newValue);

    constructor(uint256 initialValue) {
        value = initialValue;
    }

    function set(uint256 _value) public {
        value = _value;
        emit ValueChanged(_value);
    }

    function get() public view returns (uint256) {
        return value;
    }
}
          `.trim()
        }
      };

      const result = await client.callTool({
        name: "compile_and_deploy_multi_network",
        arguments: {
          sources: soliditySources,
          contractName: "SimpleStorage",
          contractFile: "SimpleStorage.sol",
          constructorArgs: [42],
          settings: {
            optimizer: { enabled: true, runs: 200 },
            evmVersion: "london"
          },
          networks: ["base-sepolia"]
        }
      });

      console.log('📦 Received deployment result');

      // Parse the result
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);

      const deploymentResult = JSON.parse(result.content[0].text);

      // Verify deployment was successful
      expect(deploymentResult.success).toBe(true);
      expect(deploymentResult.compilation).toBeDefined();
      expect(deploymentResult.deployments).toBeDefined();
      expect(Array.isArray(deploymentResult.deployments)).toBe(true);
      expect(deploymentResult.deployments.length).toBe(1);
      expect(deploymentResult.abi).toBeDefined();

      // Verify summary
      expect(deploymentResult.summary).toBeDefined();
      expect(deploymentResult.summary.total).toBe(1);
      expect(deploymentResult.summary.successful).toBe(1);
      expect(deploymentResult.summary.failed).toBe(0);

      // Verify deployment details
      const deployment = deploymentResult.deployments[0];
      expect(deployment.network).toBe('base-sepolia');
      expect(deployment.success).toBe(true);
      expect(deployment.contractAddress).toBeTruthy();
      expect(deployment.transactionHash).toBeTruthy();
      expect(deployment.blockNumber).toBeTruthy();
      expect(deployment.gasUsed).toBeTruthy();

      console.log(`   ✅ Deployed to ${deployment.network} at: ${deployment.contractAddress}`);

      // Wait for transaction to be fully propagated
      await new Promise(resolve => setTimeout(resolve, 15000));

      // Verify contract exists on-chain
      const contractValue = await publicClient.readContract({
        address: deployment.contractAddress,
        abi: parseAbi(['function get() view returns (uint256)']),
        functionName: 'get',
      });

      expect(contractValue).toBe(42n);
      console.log(`   ✅ Contract verified on-chain with constructor value: ${contractValue}`);
    }, 120000);
  });

  describe('Multi-Network Deployment', () => {
    it('should deploy to multiple networks simultaneously', async () => {
      console.log('\n🔧 Test: Deploying to multiple networks...');

      const soliditySources = {
        "Counter.sol": {
          content: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Counter {
    uint256 public count;
    string public networkName;

    constructor(string memory _networkName) {
        count = 0;
        networkName = _networkName;
    }

    function increment() public {
        count += 1;
    }

    function getCount() public view returns (uint256) {
        return count;
    }
}
          `.trim()
        }
      };

      // Deploy to multiple test networks
      const networks = ["base-sepolia", "sepolia"];

      const result = await client.callTool({
        name: "compile_and_deploy_multi_network",
        arguments: {
          sources: soliditySources,
          contractName: "Counter",
          contractFile: "Counter.sol",
          constructorArgs: ["TestNetwork"],
          settings: {
            optimizer: { enabled: true, runs: 200 }
          },
          networks: networks
        }
      });

      const deploymentResult = JSON.parse(result.content[0].text);

      // Verify overall success
      expect(deploymentResult.success).toBe(true);
      expect(deploymentResult.deployments.length).toBe(networks.length);

      // Verify both networks are present
      const deployedNetworks = deploymentResult.deployments.map(d => d.network);
      expect(deployedNetworks).toContain('base-sepolia');
      expect(deployedNetworks).toContain('sepolia');

      // Verify summary
      expect(deploymentResult.summary.total).toBe(networks.length);
      expect(deploymentResult.summary.successful).toBe(networks.length);
      expect(deploymentResult.summary.failed).toBe(0);

      // Verify each deployment
      for (const deployment of deploymentResult.deployments) {
        expect(deployment.success).toBe(true);
        expect(deployment.network).toBeTruthy();
        expect(deployment.contractAddress).toBeTruthy();
        expect(deployment.transactionHash).toBeTruthy();
        console.log(`   ✅ Deployed to ${deployment.network} at: ${deployment.contractAddress}`);
      }

      // Wait for transactions to be fully propagated (Sepolia has 12s block times)
      await new Promise(resolve => setTimeout(resolve, 15000));

      // Verify contract on base-sepolia
      const baseSepoliaDeployment = deploymentResult.deployments.find(d => d.network === 'base-sepolia');
      if (baseSepoliaDeployment) {
        const contractCount = await publicClient.readContract({
          address: baseSepoliaDeployment.contractAddress,
          abi: parseAbi(['function count() view returns (uint256)']),
          functionName: 'count',
        });

        expect(contractCount).toBe(0n);
        console.log(`   ✅ Contract verified on base-sepolia with count: ${contractCount}`);
      }

      // Verify contract on sepolia
      const sepoliaDeployment = deploymentResult.deployments.find(d => d.network === 'sepolia');
      if (sepoliaDeployment) {
        const contractCount = await sepoliaPublicClient.readContract({
          address: sepoliaDeployment.contractAddress,
          abi: parseAbi(['function count() view returns (uint256)']),
          functionName: 'count',
        });

        expect(contractCount).toBe(0n);
        console.log(`   ✅ Contract verified on sepolia with count: ${contractCount}`);
      }
    }, 180000);
  });

  describe('Post-Deployment Calls', () => {
    it('should deploy and call method on multiple networks', async () => {
      console.log('\n🔧 Test: Deploying with post-deployment call...');

      const soliditySources = {
        "Counter.sol": {
          content: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Counter {
    uint256 public count;

    constructor() {
        count = 0;
    }

    function increment() public {
        count += 1;
    }

    function incrementBy(uint256 amount) public {
        count += amount;
    }
}
          `.trim()
        }
      };

      const result = await client.callTool({
        name: "compile_and_deploy_multi_network",
        arguments: {
          sources: soliditySources,
          contractName: "Counter",
          contractFile: "Counter.sol",
          networks: ["base-sepolia", "sepolia"],
          postDeploymentCall: {
            methodName: "incrementBy",
            methodArgs: [5]
          }
        }
      });

      const deploymentResult = JSON.parse(result.content[0].text);

      expect(deploymentResult.success).toBe(true);
      expect(deploymentResult.deployments.length).toBe(2);

      // Verify both networks are present
      const deployedNetworks = deploymentResult.deployments.map(d => d.network);
      expect(deployedNetworks).toContain('base-sepolia');
      expect(deployedNetworks).toContain('sepolia');

      expect(deploymentResult.deployments.length).toBe(2);

      // Verify all deployments have successful post-deployment calls
      for (const deployment of deploymentResult.deployments) {
        expect(deployment.success).toBe(true);
        expect(deployment.postDeploymentCall).toBeDefined();
        expect(deployment.postDeploymentCall.success).toBe(true);
        expect(deployment.postDeploymentCall.methodName).toBe('incrementBy');
        expect(deployment.postDeploymentCall.transactionHash).toBeTruthy();
        expect(deployment.postDeploymentCall.gasUsed).toBeTruthy();

        console.log(`   ✅ Contract deployed and method called on ${deployment.network}`);
      }

      // Wait for transactions to be fully propagated and confirmed
      // Sepolia has 12s block times, Base Sepolia has 2s
      // Wait longer to ensure post-deployment transactions are confirmed
      // Increased wait time to account for both networks' block times
      await new Promise(resolve => setTimeout(resolve, 30000));

      // Verify the count was incremented on base-sepolia
      const baseSepoliaDeployment = deploymentResult.deployments.find(d => d.network === 'base-sepolia');
      const baseSepoliaCount = await publicClient.readContract({
        address: baseSepoliaDeployment.contractAddress,
        abi: parseAbi(['function count() view returns (uint256)']),
        functionName: 'count',
      });

      expect(baseSepoliaCount).toBe(5n);
      console.log(`   ✅ Counter verified on base-sepolia: ${baseSepoliaCount}`);

      // Verify the count was incremented on sepolia
      const sepoliaDeployment = deploymentResult.deployments.find(d => d.network === 'sepolia');
      const sepoliaCount = await sepoliaPublicClient.readContract({
        address: sepoliaDeployment.contractAddress,
        abi: parseAbi(['function count() view returns (uint256)']),
        functionName: 'count',
      });

      expect(sepoliaCount).toBe(5n);
      console.log(`   ✅ Counter verified on sepolia: ${sepoliaCount}`);
    }, 120000);
  });

  describe('Error Handling', () => {
    it('should handle compilation errors gracefully', async () => {
      console.log('\n🔧 Test: Handling compilation errors...');

      const soliditySources = {
        "Broken.sol": {
          content: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Broken {
    // Syntax error: missing semicolon
    uint256 public value

    function setValue(uint256 _value) public {
        value = _value;
    }
}
          `.trim()
        }
      };

      const result = await client.callTool({
        name: "compile_and_deploy_multi_network",
        arguments: {
          sources: soliditySources,
          contractName: "Broken",
          contractFile: "Broken.sol",
          networks: ["base-sepolia"]
        }
      });

      const deploymentResult = JSON.parse(result.content[0].text);

      // Should return a result even with errors
      expect(deploymentResult).toBeDefined();
      expect(deploymentResult.success).toBe(false);
      expect(deploymentResult.error).toBeDefined();

      console.log('✅ Compilation errors handled correctly!');
    }, 60000);

    it('should handle partial deployment failures', async () => {
      console.log('\n🔧 Test: Handling partial deployment failures...');

      const soliditySources = {
        "SimpleContract.sol": {
          content: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract SimpleContract {
    uint256 public value;

    constructor(uint256 _value) {
        value = _value;
    }
}
          `.trim()
        }
      };

      // Include an invalid network to test partial failure
      const result = await client.callTool({
        name: "compile_and_deploy_multi_network",
        arguments: {
          sources: soliditySources,
          contractName: "SimpleContract",
          contractFile: "SimpleContract.sol",
          constructorArgs: [42],
          networks: ["base-sepolia", "invalid-network"]
        }
      });

      const deploymentResult = JSON.parse(result.content[0].text);

      // Should have deployments array
      expect(deploymentResult.deployments).toBeDefined();
      expect(Array.isArray(deploymentResult.deployments)).toBe(true);
      expect(deploymentResult.deployments.length).toBe(2);

      // Verify summary shows mixed results
      expect(deploymentResult.summary.total).toBe(2);
      expect(deploymentResult.summary.successful).toBeGreaterThanOrEqual(1);
      expect(deploymentResult.summary.failed).toBeGreaterThanOrEqual(1);

      // Overall success should be false if any deployment failed
      expect(deploymentResult.success).toBe(false);

      console.log(`   ✅ Partial failures handled: ${deploymentResult.summary.successful} succeeded, ${deploymentResult.summary.failed} failed`);
    }, 120000);

    it('should handle post-deployment call failures', async () => {
      console.log('\n🔧 Test: Handling post-deployment call failures...');

      const soliditySources = {
        "SimpleStorage.sol": {
          content: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract SimpleStorage {
    uint256 private value;

    constructor(uint256 initialValue) {
        value = initialValue;
    }

    function get() public view returns (uint256) {
        return value;
    }
}
          `.trim()
        }
      };

      const result = await client.callTool({
        name: "compile_and_deploy_multi_network",
        arguments: {
          sources: soliditySources,
          contractName: "SimpleStorage",
          contractFile: "SimpleStorage.sol",
          constructorArgs: [42],
          networks: ["base-sepolia", "sepolia"],
          postDeploymentCall: {
            methodName: "nonExistentMethod",
            methodArgs: []
          }
        }
      });

      const deploymentResult = JSON.parse(result.content[0].text);

      // Deployment should succeed on both networks
      expect(deploymentResult.deployments).toBeDefined();
      expect(deploymentResult.deployments.length).toBe(2);

      // Verify both networks are present
      const networks = deploymentResult.deployments.map(d => d.network);
      expect(networks).toContain('base-sepolia');
      expect(networks).toContain('sepolia');

      // But post-deployment calls should fail on both networks
      for (const deployment of deploymentResult.deployments) {
        expect(deployment.contractAddress).toBeTruthy();
        expect(deployment.postDeploymentCall).toBeDefined();
        expect(deployment.postDeploymentCall.success).toBe(false);
        expect(deployment.postDeploymentCall.error).toBeDefined();
        console.log(`   ✅ Post-deployment call failure handled on ${deployment.network}: ${deployment.postDeploymentCall.error}`);
      }
    }, 120000);
  });

  describe('Complex Contracts', () => {
    it('should deploy contract with dependencies to multiple networks', async () => {
      console.log('\n🔧 Test: Deploying contract with library...');

      const soliditySources = {
        "Main.sol": {
          content: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Library.sol";

contract Main {
    using MathLib for uint256;

    uint256 public result;

    constructor(uint256 a, uint256 b) {
        result = a.add(b);
    }

    function addNumbers(uint256 a, uint256 b) public returns (uint256) {
        result = a.add(b);
        return result;
    }
}
          `.trim()
        },
        "Library.sol": {
          content: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library MathLib {
    function add(uint256 a, uint256 b) internal pure returns (uint256) {
        return a + b;
    }
}
          `.trim()
        }
      };

      const result = await client.callTool({
        name: "compile_and_deploy_multi_network",
        arguments: {
          sources: soliditySources,
          contractName: "Main",
          contractFile: "Main.sol",
          constructorArgs: [10, 20],
          settings: {
            optimizer: { enabled: true, runs: 200 }
          },
          networks: ["base-sepolia", "sepolia"]
        }
      });

      const deploymentResult = JSON.parse(result.content[0].text);

      expect(deploymentResult.success).toBe(true);
      expect(deploymentResult.deployments.length).toBe(2);

      // Verify both networks are present
      const networks = deploymentResult.deployments.map(d => d.network);
      expect(networks).toContain('base-sepolia');
      expect(networks).toContain('sepolia');

      for (const deployment of deploymentResult.deployments) {
        expect(deployment.success).toBe(true);
        expect(deployment.contractAddress).toBeTruthy();
        console.log(`   ✅ ${deployment.network}: ${deployment.contractAddress}`);
      }

      // Wait for transaction to be fully propagated (Sepolia has 12s block times)
      await new Promise(resolve => setTimeout(resolve, 15000));

      // Verify the constructor calculation was correct on base-sepolia
      const baseSepoliaDeployment = deploymentResult.deployments.find(d => d.network === 'base-sepolia');
      const baseSepoliaResult = await publicClient.readContract({
        address: baseSepoliaDeployment.contractAddress,
        abi: parseAbi(['function result() view returns (uint256)']),
        functionName: 'result',
      });

      expect(baseSepoliaResult).toBe(30n);
      console.log(`   ✅ Contract with library verified on base-sepolia, result: ${baseSepoliaResult}`);

      // Verify the constructor calculation was correct on sepolia
      const sepoliaDeployment = deploymentResult.deployments.find(d => d.network === 'sepolia');
      const sepoliaResult = await sepoliaPublicClient.readContract({
        address: sepoliaDeployment.contractAddress,
        abi: parseAbi(['function result() view returns (uint256)']),
        functionName: 'result',
      });

      expect(sepoliaResult).toBe(30n);
      console.log(`   ✅ Contract with library verified on sepolia, result: ${sepoliaResult}`);
    }, 120000);
  });
});
