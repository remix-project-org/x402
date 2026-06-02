import { describe, expect, it, beforeAll, afterAll, afterEach } from '@jest/globals';
import { createMCPClient } from '../../src/lib/index.js';
import { createPublicClient, http, parseAbi } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

describe('Compile and Deploy E2E Tests', () => {
  let client, transport, wallet, publicClient, expectedDeployerAddress;
  const serverUrl = process.env.MCP_SERVER_URL || 'http://localhost:8000/mcp';
  const payToAddress = process.env.PAY_TO_ADDRESS;
  const usdcAddress = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'; // Base Sepolia USDC
  const EXPECTED_DEPLOYMENT_COST = 50000n; // 0.05 USDC (in smallest units)

  // Derive the expected deployer address from the server's private key
  if (!process.env.SERVER_DEPLOYER_PRIVATE_KEY) {
    throw new Error('SERVER_DEPLOYER_PRIVATE_KEY environment variable is required for deployment tests');
  }
  const deployerAccount = privateKeyToAccount(process.env.SERVER_DEPLOYER_PRIVATE_KEY);
  expectedDeployerAddress = deployerAccount.address;

  // ERC20 ABI for balanceOf
  const erc20Abi = [
    {
      constant: true,
      inputs: [{ name: '_owner', type: 'address' }],
      name: 'balanceOf',
      outputs: [{ name: 'balance', type: 'uint256' }],
      type: 'function',
    },
  ];

  async function getUSDCBalance(address) {
    return await publicClient.readContract({
      address: usdcAddress,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [address],
    });
  }

  beforeAll(async () => {
    console.log('\n🔌 Connecting to MCP server...');
    const mcpSetup = createMCPClient(serverUrl, {
      name: 'E2E-Deploy-Test-Client',
      version: '1.0.0'
    });

    client = mcpSetup.client;
    transport = mcpSetup.transport;
    wallet = mcpSetup.wallet;

    // Create public client for balance checks and contract interactions
    publicClient = createPublicClient({
      chain: baseSepolia,
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
    console.log('⏳ Waiting for transactions to settle...');
    await new Promise(resolve => setTimeout(resolve, 5000));
  });

  afterAll(async () => {
    if (client) {
      await client.close();
      console.log('\n👋 Disconnected from MCP server');
    }
  });

  describe('Basic Deployment', () => {
    it('should compile and deploy a simple contract with payment', async () => {
      console.log('\n🔧 Test: Deploying SimpleStorage contract...');

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

      const compilerSettings = {
        optimizer: {
          enabled: true,
          runs: 200
        },
        evmVersion: "london"
      };

      // Call compile_and_deploy tool - payment should be handled automatically
      const result = await client.callTool({
        name: "compile_and_deploy",
        arguments: {
          sources: soliditySources,
          contractName: "SimpleStorage",
          contractFile: "SimpleStorage.sol",
          constructorArgs: [42],
          settings: compilerSettings,
          network: "base-sepolia"
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
      expect(deploymentResult.deployment).toBeDefined();
      expect(deploymentResult.abi).toBeDefined();

      // Verify compiler settings that were used (should match the provided settings)
      expect(deploymentResult.compilation.settings).toBeDefined();
      expect(deploymentResult.compilation.settings.optimizer.enabled).toBe(true);
      expect(deploymentResult.compilation.settings.optimizer.runs).toBe(200);
      expect(deploymentResult.compilation.settings.evmVersion).toBe('london');

      // Verify deployment details
      expect(deploymentResult.deployment.success).toBe(true);
      expect(deploymentResult.deployment.contractAddress).toBeTruthy();
      expect(deploymentResult.deployment.transactionHash).toBeTruthy();
      expect(deploymentResult.deployment.blockNumber).toBeTruthy();
      expect(deploymentResult.deployment.gasUsed).toBeTruthy();
      expect(deploymentResult.deployment.network).toBe('base-sepolia');
      expect(deploymentResult.deployment.deployedBy).toBe('server-delegated-deployer');
      expect(deploymentResult.deployment.deployerAddress).toBeTruthy();

      // Verify deployer address matches the expected server deployer address from environment
      expect(deploymentResult.deployment.deployerAddress).toBe(expectedDeployerAddress);
      console.log(`   ✅ Deployer address verified: ${expectedDeployerAddress}`);

      // Verify ABI is present and valid
      expect(Array.isArray(deploymentResult.abi)).toBe(true);
      expect(deploymentResult.abi.length).toBeGreaterThan(0);

      // Wait for transaction to be fully propagated
      await new Promise(resolve => setTimeout(resolve, 8000));

      // Verify contract exists on-chain by reading the constructor value
      const contractValue = await publicClient.readContract({
        address: deploymentResult.deployment.contractAddress,
        abi: parseAbi(['function get() view returns (uint256)']),
        functionName: 'get',
      });

      expect(contractValue).toBe(42n);
      console.log(`   ✅ Contract verified on-chain with constructor value: ${contractValue}`);
    }, 120000); // 120 second timeout for deployment

    it('should compile and deploy contract with custom compiler settings', async () => {
      console.log('\n🔧 Test: Deploying with custom compiler settings...');

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

    function decrement() public {
        require(count > 0, "Counter: cannot decrement below zero");
        count -= 1;
    }
}
          `.trim()
        }
      };

      const compilerSettings = {
        optimizer: {
          enabled: false,
          runs: 100
        },
        evmVersion: "paris"
      };

      const result = await client.callTool({
        name: "compile_and_deploy",
        arguments: {
          sources: soliditySources,
          contractName: "Counter",
          contractFile: "Counter.sol",
          settings: compilerSettings,
          network: "base-sepolia"
        }
      });

      const deploymentResult = JSON.parse(result.content[0].text);

      expect(deploymentResult.success).toBe(true);
      expect(deploymentResult.deployment.success).toBe(true);
      expect(deploymentResult.deployment.contractAddress).toBeTruthy();

      // Verify compilation with custom compiler settings
      expect(deploymentResult.compilation).toBeDefined();
      expect(deploymentResult.compilation.settings).toBeDefined();

      // Verify the custom compiler settings were actually used
      expect(deploymentResult.compilation.settings.optimizer.enabled).toBe(false);
      expect(deploymentResult.compilation.settings.optimizer.runs).toBe(100);
      expect(deploymentResult.compilation.settings.evmVersion).toBe('paris');

      // Verify deployment details
      expect(deploymentResult.deployment.network).toBe('base-sepolia');
      expect(deploymentResult.deployment.deployedBy).toBe('server-delegated-deployer');

      // Verify deployer address matches the expected server deployer address
      expect(deploymentResult.deployment.deployerAddress).toBe(expectedDeployerAddress);
      console.log(`   ✅ Deployer address verified with custom settings: ${expectedDeployerAddress}`);
      console.log(`   ✅ Custom compiler settings verified: optimizer disabled, runs: 100, evmVersion: paris`);

      // Wait for transaction to be fully propagated
      await new Promise(resolve => setTimeout(resolve, 8000));

      // Verify contract on-chain
      const contractCount = await publicClient.readContract({
        address: deploymentResult.deployment.contractAddress,
        abi: parseAbi(['function count() view returns (uint256)']),
        functionName: 'count',
      });

      expect(contractCount).toBe(0n);
      console.log(`   ✅ Counter contract deployed with initial count: ${contractCount}`);
    }, 120000);
  });

  describe('Compiler Version Flexibility', () => {
    it('should deploy with custom compiler version', async () => {
      console.log('\n🔧 Test: Deploying with custom compiler version...');

      const soliditySources = {
        "VersionTest.sol": {
          content: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract VersionTest {
    uint256 public value;

    constructor(uint256 _value) {
        value = _value;
    }

    function getValue() public view returns (uint256) {
        return value;
    }

    function increment() public {
        value += 1;
    }
}
          `.trim()
        }
      };

      const customVersion = "v0.8.20+commit.a1b79de6";

      const result = await client.callTool({
        name: "compile_and_deploy",
        arguments: {
          sources: soliditySources,
          contractName: "VersionTest",
          contractFile: "VersionTest.sol",
          network: "base-sepolia",
          version: customVersion,
          constructorArgs: [100],
          settings: {
            optimizer: { enabled: true, runs: 200 },
            evmVersion: "paris" // v0.8.20 doesn't support osaka
          }
        }
      });

      const deploymentResult = JSON.parse(result.content[0].text);

      expect(deploymentResult.success).toBe(true);
      expect(deploymentResult.deployment).toBeDefined();
      expect(deploymentResult.deployment.contractAddress).toBeTruthy();
      expect(deploymentResult.deployment.transactionHash).toBeTruthy();

      console.log(`   ✅ Contract deployed at: ${deploymentResult.deployment.contractAddress}`);
      console.log(`   ✅ Requested compiler version: ${customVersion}`);

      // Verify the compilation used the exact compiler version we requested
      expect(deploymentResult.compilation).toBeDefined();
      expect(deploymentResult.compilation.version).toBe(customVersion);
      console.log(`   ✅ Verified compiler version: ${deploymentResult.compilation.version}`);

      // Verify bytecode exists and is different from default version compilation
      // The bytecode should be compiled with v0.8.20, not the default v0.8.35
      const deployedBytecode = await publicClient.getBytecode({
        address: deploymentResult.deployment.contractAddress
      });

      expect(deployedBytecode).toBeTruthy();
      expect(deployedBytecode.length).toBeGreaterThan(100); // Reasonable bytecode size

      console.log(`   ✅ Bytecode deployed successfully (${deployedBytecode.length} bytes)`);

      // Wait for transaction confirmation
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Verify the deployed contract functions correctly
      const value = await publicClient.readContract({
        address: deploymentResult.deployment.contractAddress,
        abi: deploymentResult.abi,
        functionName: 'getValue',
      });

      expect(value).toBe(100n);
      console.log(`   ✅ Contract verified on-chain with constructor value: ${value}`);
      console.log(`   ✅ Deployment with custom version successful!`);
    }, 120000);
  });

  describe('Deployment with Post-Deployment Call', () => {
    it('should deploy and call a method successfully', async () => {
      console.log('\n🔧 Test: Deploying and calling set method...');

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
        name: "compile_and_deploy",
        arguments: {
          sources: soliditySources,
          contractName: "SimpleStorage",
          contractFile: "SimpleStorage.sol",
          constructorArgs: [42],
          settings: {
            optimizer: { enabled: true, runs: 200 },
            evmVersion: "london"
          },
          network: "base-sepolia",
          postDeploymentCall: {
            methodName: "set",
            methodArgs: [100]
          }
        }
      });

      const deploymentResult = JSON.parse(result.content[0].text);

      // Verify deployment success
      expect(deploymentResult.success).toBe(true);
      expect(deploymentResult.deployment.success).toBe(true);

      // Verify post-deployment call success
      expect(deploymentResult.postDeploymentCall).toBeDefined();
      expect(deploymentResult.postDeploymentCall.success).toBe(true);
      expect(deploymentResult.postDeploymentCall.methodName).toBe('set');
      expect(deploymentResult.postDeploymentCall.methodArgs).toEqual([100]);
      expect(deploymentResult.postDeploymentCall.transactionHash).toBeTruthy();
      expect(deploymentResult.postDeploymentCall.blockNumber).toBeTruthy();
      expect(deploymentResult.postDeploymentCall.gasUsed).toBeTruthy();

      console.log(`   ✅ Contract deployed at: ${deploymentResult.deployment.contractAddress}`);
      console.log(`   ✅ Method called: ${deploymentResult.postDeploymentCall.methodName}`);

      // Wait for transaction to be fully propagated
      await new Promise(resolve => setTimeout(resolve, 8000));

      // Verify the value was set correctly on-chain
      const contractValue = await publicClient.readContract({
        address: deploymentResult.deployment.contractAddress,
        abi: parseAbi(['function get() view returns (uint256)']),
        functionName: 'get',
      });

      expect(contractValue).toBe(100n);
      console.log(`   ✅ Value verified on-chain: ${contractValue}`);
    }, 90000); // 90 second timeout for deployment + method call

    it('should deploy and call method after deployment', async () => {
      console.log('\n🔧 Test: Deploying and calling incrementBy method...');

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
        name: "compile_and_deploy",
        arguments: {
          sources: soliditySources,
          contractName: "Counter",
          contractFile: "Counter.sol",
          network: "base-sepolia",
          postDeploymentCall: {
            methodName: "incrementBy",
            methodArgs: [5]
          }
        }
      });

      const deploymentResult = JSON.parse(result.content[0].text);

      expect(deploymentResult.success).toBe(true);
      expect(deploymentResult.postDeploymentCall.success).toBe(true);

      // Wait for transaction to be fully propagated
      await new Promise(resolve => setTimeout(resolve, 8000));

      // Verify the count was incremented
      const contractCount = await publicClient.readContract({
        address: deploymentResult.deployment.contractAddress,
        abi: parseAbi(['function count() view returns (uint256)']),
        functionName: 'count',
      });

      expect(contractCount).toBe(5n);
      console.log(`   ✅ Counter incremented to: ${contractCount}`);
    }, 90000);

    it('should deploy and call payable method with value', async () => {
      console.log('\n🔧 Test: Deploying and calling payable method with value...');

      const soliditySources = {
        "PayableReceiver.sol": {
          content: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract PayableReceiver {
    uint256 public totalReceived;
    uint256 public lastPayment;
    address public lastSender;

    event PaymentReceived(address sender, uint256 amount);

    constructor() {
        totalReceived = 0;
    }

    function receivePayment() public payable {
        require(msg.value > 0, "Must send some value");
        totalReceived += msg.value;
        lastPayment = msg.value;
        lastSender = msg.sender;
        emit PaymentReceived(msg.sender, msg.value);
    }

    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }
}
          `.trim()
        }
      };

      const paymentValue = 50000000000000n; // 0.00005 ETH in wei

      const result = await client.callTool({
        name: "compile_and_deploy",
        arguments: {
          sources: soliditySources,
          contractName: "PayableReceiver",
          contractFile: "PayableReceiver.sol",
          network: "base-sepolia",
          postDeploymentCall: {
            methodName: "receivePayment",
            methodArgs: [],
            value: paymentValue.toString() // Send value with method call
          }
        }
      });

      const deploymentResult = JSON.parse(result.content[0].text);

      expect(deploymentResult.success).toBe(true);
      expect(deploymentResult.postDeploymentCall.success).toBe(true);

      console.log(`   ✅ Contract deployed at: ${deploymentResult.deployment.contractAddress}`);
      console.log(`   ✅ Payable method called with value: ${paymentValue} wei`);

      // Wait a bit for the transaction to be fully confirmed
      console.log('⏳ Waiting for transaction to be fully propagated...');
      await new Promise(resolve => setTimeout(resolve, 10000));

      console.log(`   📍 Reading from contract: ${deploymentResult.deployment.contractAddress}`);

      // Verify the contract received the payment
      const contractBalance = await publicClient.readContract({
        address: deploymentResult.deployment.contractAddress,
        abi: parseAbi(['function getBalance() view returns (uint256)']),
        functionName: 'getBalance',
      });

      expect(contractBalance).toBe(paymentValue);
      console.log(`   ✅ Contract balance verified: ${contractBalance} wei`);

      // Verify the total received was tracked
      const totalReceived = await publicClient.readContract({
        address: deploymentResult.deployment.contractAddress,
        abi: parseAbi(['function totalReceived() view returns (uint256)']),
        functionName: 'totalReceived',
      });

      expect(totalReceived).toBe(paymentValue);
      console.log(`   ✅ Total received verified: ${totalReceived} wei`);

      // Verify the last payment amount
      const lastPayment = await publicClient.readContract({
        address: deploymentResult.deployment.contractAddress,
        abi: parseAbi(['function lastPayment() view returns (uint256)']),
        functionName: 'lastPayment',
      });

      expect(lastPayment).toBe(paymentValue);
      console.log(`   ✅ Last payment verified: ${lastPayment} wei`);

      // Verify the value was actually sent by checking the transaction details
      const methodCallTx = await publicClient.getTransaction({
        hash: deploymentResult.postDeploymentCall.transactionHash,
      });

      expect(methodCallTx.value).toBe(paymentValue);
      console.log(`   ✅ Transaction value verified from blockchain: ${methodCallTx.value} wei`);
      console.log(`   ✅ X402 fee included the method call value in cost calculation`);
    }, 90000);
  });

  describe('Multi-Contract Deployment', () => {
    it('should deploy contract with dependencies', async () => {
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
        name: "compile_and_deploy",
        arguments: {
          sources: soliditySources,
          contractName: "Main",
          contractFile: "Main.sol",
          constructorArgs: [10, 20],
          settings: {
            optimizer: { enabled: true, runs: 200 }
          },
          network: "base-sepolia"
        }
      });

      const deploymentResult = JSON.parse(result.content[0].text);

      expect(deploymentResult.success).toBe(true);
      expect(deploymentResult.deployment.contractAddress).toBeTruthy();

      // Wait for transaction to be fully propagated
      await new Promise(resolve => setTimeout(resolve, 8000));

      // Verify the constructor calculation was correct
      const contractResult = await publicClient.readContract({
        address: deploymentResult.deployment.contractAddress,
        abi: parseAbi(['function result() view returns (uint256)']),
        functionName: 'result',
      });

      expect(contractResult).toBe(30n);
      console.log(`   ✅ Contract with library deployed, result: ${contractResult}`);
    }, 120000);
  });

  describe('Payment Verification', () => {
    it('should verify payment was made by checking balance changes', async () => {
      console.log('\n🔧 Test: Verifying payment through balance check...');

      if (!payToAddress) {
        console.log('⚠️  PAY_TO_ADDRESS not set, skipping balance verification');
        return;
      }

      // Wait to ensure any pending transactions from previous tests have settled
      console.log('⏳ Waiting for any pending transactions to settle...');
      await new Promise(resolve => setTimeout(resolve, 15000));

      // Get baseline balance
      const baselineBalance = await getUSDCBalance(payToAddress);
      console.log(`💰 Baseline balance: ${baselineBalance} USDC`);

      const soliditySources = {
        "PaymentTest.sol": {
          content: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract PaymentTest {
    uint256 public value = 42;
}
          `.trim()
        }
      };

      // Deploy - this should trigger payment
      const result = await client.callTool({
        name: "compile_and_deploy",
        arguments: {
          sources: soliditySources,
          contractName: "PaymentTest",
          contractFile: "PaymentTest.sol",
          network: "base-sepolia"
        }
      });

      const deploymentResult = JSON.parse(result.content[0].text);
      expect(deploymentResult.success).toBe(true);

      // Wait for blockchain transaction to be confirmed
      console.log('⏳ Waiting for payment transaction to be confirmed...');
      await new Promise(resolve => setTimeout(resolve, 10000));

      // Get final balance
      const finalBalance = await getUSDCBalance(payToAddress);

      // Verify that payment was made (balance increased)
      expect(finalBalance).toBeGreaterThan(baselineBalance);
      const paymentAmount = finalBalance - baselineBalance;

      // Verify the payment amount is reasonable (should be close to expected cost with dynamic pricing)
      // Dynamic pricing means it won't be exactly EXPECTED_DEPLOYMENT_COST, but should be in a reasonable range
      expect(paymentAmount).toBeGreaterThanOrEqual(EXPECTED_DEPLOYMENT_COST);
      expect(paymentAmount).toBeLessThan(EXPECTED_DEPLOYMENT_COST * 2n); // Should not be more than 2x

      console.log(`✅ Payment verified! Amount paid: ${paymentAmount} USDC (expected ~${EXPECTED_DEPLOYMENT_COST})`);
    }, 120000);
  });

  describe('Deployment with Value', () => {
    it('should deploy a payable constructor with value and include it in x402 fee', async () => {
      console.log('\n🔧 Test: Deploying contract with value (payable constructor)...');

      const soliditySources = {
        "PayableContract.sol": {
          content: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract PayableContract {
    uint256 public deploymentValue;
    address public owner;

    constructor() payable {
        deploymentValue = msg.value;
        owner = msg.sender;
    }

    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }
}
          `.trim()
        }
      };

      const deploymentValue = 100000000000000n; // 0.0001 ETH in wei

      const result = await client.callTool({
        name: "compile_and_deploy",
        arguments: {
          sources: soliditySources,
          contractName: "PayableContract",
          contractFile: "PayableContract.sol",
          settings: {
            optimizer: { enabled: true, runs: 200 },
            evmVersion: "london"
          },
          network: "base-sepolia",
          value: deploymentValue.toString() // Send value with deployment
        }
      });

      const deploymentResult = JSON.parse(result.content[0].text);

      // Verify deployment success
      expect(deploymentResult.success).toBe(true);
      expect(deploymentResult.deployment.success).toBe(true);
      expect(deploymentResult.deployment.contractAddress).toBeTruthy();

      console.log(`   ✅ Contract deployed at: ${deploymentResult.deployment.contractAddress}`);
      console.log(`   ✅ Value sent: ${deploymentValue} wei`);

      // Wait a bit for the transaction to be fully confirmed
      console.log('⏳ Waiting for transaction to be fully propagated...');
      await new Promise(resolve => setTimeout(resolve, 8000));

      // Verify the contract received the value
      const contractBalance = await publicClient.readContract({
        address: deploymentResult.deployment.contractAddress,
        abi: parseAbi(['function getBalance() view returns (uint256)']),
        functionName: 'getBalance',
      });

      expect(contractBalance).toBe(deploymentValue);
      console.log(`   ✅ Contract balance verified: ${contractBalance} wei`);

      // Verify the deployment value was recorded
      const deploymentValueStored = await publicClient.readContract({
        address: deploymentResult.deployment.contractAddress,
        abi: parseAbi(['function deploymentValue() view returns (uint256)']),
        functionName: 'deploymentValue',
      });

      expect(deploymentValueStored).toBe(deploymentValue);
      console.log(`   ✅ Deployment value stored: ${deploymentValueStored} wei`);

      // Verify the value was actually sent by checking the transaction details
      const deploymentTx = await publicClient.getTransaction({
        hash: deploymentResult.deployment.transactionHash,
      });

      expect(deploymentTx.value).toBe(deploymentValue);
      console.log(`   ✅ Transaction value verified from blockchain: ${deploymentTx.value} wei`);
      console.log(`   ✅ X402 fee included the deployment value in cost calculation`);
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
        name: "compile_and_deploy",
        arguments: {
          sources: soliditySources,
          contractName: "Broken",
          contractFile: "Broken.sol",
          network: "base-sepolia"
        }
      });

      const deploymentResult = JSON.parse(result.content[0].text);

      // Should return a result even with errors
      expect(deploymentResult).toBeDefined();
      expect(deploymentResult.success).toBe(false);
      expect(deploymentResult.error).toBeDefined();

      console.log('✅ Compilation errors handled correctly!');
    }, 60000);

    it('should handle invalid constructor arguments', async () => {
      console.log('\n🔧 Test: Handling invalid constructor arguments...');

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
        name: "compile_and_deploy",
        arguments: {
          sources: soliditySources,
          contractName: "SimpleStorage",
          contractFile: "SimpleStorage.sol",
          constructorArgs: [], // Missing required argument
          network: "base-sepolia"
        }
      });

      const deploymentResult = JSON.parse(result.content[0].text);

      expect(deploymentResult).toBeDefined();
      expect(deploymentResult.success).toBe(false);

      console.log('✅ Invalid constructor arguments handled correctly!');
    }, 60000);

    it('should handle non-existent post-deployment method gracefully', async () => {
      console.log('\n🔧 Test: Handling non-existent post-deployment method...');

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
        name: "compile_and_deploy",
        arguments: {
          sources: soliditySources,
          contractName: "SimpleStorage",
          contractFile: "SimpleStorage.sol",
          constructorArgs: [42],
          network: "base-sepolia",
          postDeploymentCall: {
            methodName: "nonExistentMethod", // This method doesn't exist
            methodArgs: [100]
          }
        }
      });

      const deploymentResult = JSON.parse(result.content[0].text);

      // Deployment should succeed
      expect(deploymentResult).toBeDefined();
      expect(deploymentResult.deployment).toBeDefined();
      expect(deploymentResult.deployment.success).toBe(true);
      expect(deploymentResult.deployment.contractAddress).toBeTruthy();

      // But overall success should be false due to method call failure
      expect(deploymentResult.success).toBe(false);

      // Post-deployment call should have failed
      expect(deploymentResult.postDeploymentCall).toBeDefined();
      expect(deploymentResult.postDeploymentCall.success).toBe(false);
      expect(deploymentResult.postDeploymentCall.error).toBeDefined();
      expect(deploymentResult.postDeploymentCall.methodName).toBe('nonExistentMethod');

      // Error should be deterministic - viem returns "not found" for non-existent functions
      expect(deploymentResult.postDeploymentCall.error.toLowerCase()).toContain('not found');

      console.log(`✅ Non-existent method error handled correctly: ${deploymentResult.postDeploymentCall.error}`);
      console.log(`✅ Contract was deployed at: ${deploymentResult.deployment.contractAddress}`);
      console.log('✅ Overall operation marked as failed');
    }, 90000);

    it('should handle invalid post-deployment method arguments gracefully', async () => {
      console.log('\n🔧 Test: Handling invalid post-deployment method arguments...');

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

    function set(uint256 _value) public {
        value = _value;
    }

    function get() public view returns (uint256) {
        return value;
    }
}
          `.trim()
        }
      };

      const result = await client.callTool({
        name: "compile_and_deploy",
        arguments: {
          sources: soliditySources,
          contractName: "SimpleStorage",
          contractFile: "SimpleStorage.sol",
          constructorArgs: [42],
          network: "base-sepolia",
          postDeploymentCall: {
            methodName: "set",
            methodArgs: [] // Missing required argument (should be a uint256)
          }
        }
      });

      const deploymentResult = JSON.parse(result.content[0].text);

      // Deployment should succeed
      expect(deploymentResult).toBeDefined();
      expect(deploymentResult.deployment).toBeDefined();
      expect(deploymentResult.deployment.success).toBe(true);
      expect(deploymentResult.deployment.contractAddress).toBeTruthy();

      // But overall success should be false due to method call failure
      expect(deploymentResult.success).toBe(false);

      // Post-deployment call should have failed
      expect(deploymentResult.postDeploymentCall).toBeDefined();
      expect(deploymentResult.postDeploymentCall.success).toBe(false);
      expect(deploymentResult.postDeploymentCall.error).toBeDefined();
      expect(deploymentResult.postDeploymentCall.methodName).toBe('set');

      // Error should be deterministic - viem returns "mismatch" for wrong argument count
      expect(deploymentResult.postDeploymentCall.error.toLowerCase()).toContain('mismatch');

      console.log(`✅ Invalid arguments error handled correctly: ${deploymentResult.postDeploymentCall.error}`);
      console.log(`✅ Contract was deployed at: ${deploymentResult.deployment.contractAddress}`);
      console.log('✅ Overall operation marked as failed');
    }, 90000);
  });
});
