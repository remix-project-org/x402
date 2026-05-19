import { describe, expect, it, beforeAll, afterAll } from '@jest/globals';
import { createMCPClient } from '../helpers/index.js';
import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';

describe('Analyze Slither E2E Tests', () => {
  let client, transport, wallet, publicClient;
  const serverUrl = process.env.MCP_SERVER_URL || 'http://localhost:8000/mcp';
  const payToAddress = process.env.PAY_TO_ADDRESS;
  const usdcAddress = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'; // Base Sepolia USDC
  const EXPECTED_SLITHER_COST = 20000n; // 0.02 USDC (in smallest units)

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
      name: 'E2E-Slither-Test-Client',
      version: '1.0.0'
    });

    client = mcpSetup.client;
    transport = mcpSetup.transport;
    wallet = mcpSetup.wallet;

    // Create public client for balance checks
    publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(),
    });

    await client.connect(transport);
    console.log('✅ Connected to MCP server');
    console.log(`💼 Test wallet address: ${wallet.address}`);
    console.log(`💰 Payment recipient: ${payToAddress}`);
  });

  afterAll(async () => {
    if (client) {
      await client.close();
      console.log('\n👋 Disconnected from MCP server');
    }
  });

  describe('Basic Analysis', () => {
    it('should analyze a simple Solidity contract with payment', async () => {
      console.log('\n🔧 Test: Analyzing contract with Slither...');

      const soliditySources = {
        "VulnerableContract.sol": {
          content: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract VulnerableContract {
    address public owner;

    constructor() {
        owner = msg.sender;
    }

    // Vulnerable to tx.origin attack
    function transferOwnership(address newOwner) public {
        require(tx.origin == owner, "Not owner");
        owner = newOwner;
    }

    function withdraw() public {
        require(msg.sender == owner, "Not owner");
        payable(owner).transfer(address(this).balance);
    }
}
          `.trim()
        }
      };

      // Call analyze_with_slither tool - payment should be handled automatically
      const result = await client.callTool({
        name: "analyze_with_slither",
        arguments: {
          sources: soliditySources
        }
      });


      // Parse the result
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);

      const analysisResult = JSON.parse(result.content[0].text);

      // Verify analysis was successful
      expect(analysisResult.success).toBe(true);
      expect(analysisResult.summary).toBeDefined();
      expect(analysisResult.findings).toBeDefined();
      expect(Array.isArray(analysisResult.findings)).toBe(true);

      // Verify total findings count (tx.origin vulnerability + other detectors)
      expect(analysisResult.summary.totalFindings).toEqual(3);
      expect(analysisResult.summary.high).toEqual(0);
      expect(analysisResult.summary.medium).toEqual(1);
      expect(analysisResult.summary.low).toEqual(1);
      expect(analysisResult.summary.informational).toEqual(1);
    });

    it('should analyze contract with custom version', async () => {

      const soliditySources = {
        "SimpleStorage.sol": {
          content: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract SimpleStorage {
    uint256 private value;

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
        name: "analyze_with_slither",
        arguments: {
          sources: soliditySources,
          version: "0.8.26+commit.8a97fa7a"
        }
      });

      const analysisResult = JSON.parse(result.content[0].text);

      expect(analysisResult.success).toBe(true);
      expect(analysisResult.summary).toBeDefined();
      expect(analysisResult.findings).toBeDefined();

      // Verify the compiler version matches what was requested
      expect(analysisResult.compilerVersion).toBe("0.8.26+commit.8a97fa7a");

      console.log(`   Compiler version: ${analysisResult.compilerVersion}`);
    });

    it('should analyze contracts with imports', async () => {

      const soliditySources = {
        "Ownable.sol": {
          content: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Ownable {
    address public owner;

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(tx.origin == owner, "Not owner");
        _;
    }

    function transferOwnership(address newOwner) public onlyOwner {
        owner = newOwner;
    }
}
          `.trim()
        },
        "Wallet.sol": {
          content: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Ownable.sol";

contract Wallet is Ownable {
    mapping(address => uint256) public balances;

    function deposit() public payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw() public onlyOwner {
        payable(owner).transfer(address(this).balance);
    }
}
          `.trim()
        }
      };

      const result = await client.callTool({
        name: "analyze_with_slither",
        arguments: {
          sources: soliditySources,
          excludeInformational: false,
          excludeLow: false
        }
      });

      const analysisResult = JSON.parse(result.content[0].text);

      expect(analysisResult.success).toBe(true);
      expect(analysisResult.summary).toBeDefined();
      expect(analysisResult.findings).toBeDefined();

      // If imports work correctly, we should have at least some findings (solc-version, naming-convention, or tx.origin)
      expect(analysisResult.summary.totalFindings).toEqual(3);
    });

    it('should verify payment was made by checking balance changes', async () => {
      console.log('\n🔧 Test: Verifying payment through balance check...');

      if (!payToAddress) {
        console.log('⚠️  PAY_TO_ADDRESS not set, skipping balance verification');
        return;
      }

      // Get initial balance of payment recipient
      const initialBalance = await getUSDCBalance(payToAddress);
      console.log(`💰 Initial balance of ${payToAddress}: ${initialBalance} USDC`);

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

      // Analyze - this should trigger payment
      const result = await client.callTool({
        name: "analyze_with_slither",
        arguments: {
          sources: soliditySources
        }
      });

      const analysisResult = JSON.parse(result.content[0].text);
      expect(analysisResult.success).toBe(true);

      // Get final balance of payment recipient
      const finalBalance = await getUSDCBalance(payToAddress);
      console.log(`💰 Final balance of ${payToAddress}: ${finalBalance} USDC`);

      // Verify that payment was made (balance increased)
      expect(finalBalance).toBeGreaterThan(initialBalance);
      const paymentAmount = finalBalance - initialBalance;
      console.log(`✅ Payment verified! Amount paid: ${paymentAmount} USDC`);

      // Verify the payment amount matches the expected analysis cost
      expect(paymentAmount).toBe(EXPECTED_SLITHER_COST);
    });
  });

  describe('Filtering Options', () => {
    it('should filter findings by severity', async () => {
      console.log('\n🔧 Test: Filtering informational findings...');

      const soliditySources = {
        "Contract.sol": {
          content: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Contract {
    uint256 public value;

    function setValue(uint256 _value) public {
        value = _value;
    }
}
          `.trim()
        }
      };

      const result = await client.callTool({
        name: "analyze_with_slither",
        arguments: {
          sources: soliditySources,
          excludeInformational: true,
          excludeLow: true
        }
      });

      const analysisResult = JSON.parse(result.content[0].text);

      expect(analysisResult.success).toBe(true);
      expect(analysisResult.summary).toBeDefined();

      // Verify no informational or low findings in filtered results
      const hasInformational = analysisResult.findings.some(f => f.impact === 'Informational');
      const hasLow = analysisResult.findings.some(f => f.impact === 'Low');

      expect(hasInformational).toBe(false);
      expect(hasLow).toBe(false);

      console.log(`   Filtered findings: ${analysisResult.summary.totalFindings}`);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid contract gracefully', async () => {
      console.log('\n🔧 Test: Handling invalid contract...');

      const soliditySources = {
        "Broken.sol": {
          content: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Broken {
    // Syntax error
    uint256 public value
}
          `.trim()
        }
      };

      const result = await client.callTool({
        name: "analyze_with_slither",
        arguments: {
          sources: soliditySources
        }
      });

      const analysisResult = JSON.parse(result.content[0].text);

      // Should return a result even with errors
      expect(analysisResult).toBeDefined();
      expect(analysisResult).toHaveProperty('success');
      expect(analysisResult.success).toBe(false);
      expect(analysisResult).toHaveProperty('error');
      expect(typeof analysisResult.error).toBe('string');
      expect(analysisResult.error.length).toBeGreaterThan(0);
      expect(analysisResult.error).toContain('Compiler run failed');

      console.log(`   Error message: ${analysisResult.error}`);
    });
  });
});
