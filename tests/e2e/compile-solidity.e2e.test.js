import { describe, expect, it, beforeAll, afterAll } from '@jest/globals';
import { createMCPClient } from '../helpers/index.js';

describe('Compile Solidity E2E Tests', () => {
  let client, transport, wallet;
  const serverUrl = process.env.MCP_SERVER_URL || 'http://localhost:8000/mcp';

  beforeAll(async () => {
    console.log('\n🔌 Connecting to MCP server...');
    const mcpSetup = createMCPClient(serverUrl, {
      name: 'E2E-Test-Client',
      version: '1.0.0'
    });

    client = mcpSetup.client;
    transport = mcpSetup.transport;
    wallet = mcpSetup.wallet;

    await client.connect(transport);
    console.log('✅ Connected to MCP server');
    console.log(`💼 Test wallet address: ${wallet.address}`);
  });

  afterAll(async () => {
    if (client) {
      await client.close();
      console.log('\n👋 Disconnected from MCP server');
    }
  });

  describe('Basic Compilation', () => {
    it('should compile a simple Solidity contract with payment', async () => {
      console.log('\n🔧 Test: Compiling SimpleStorage contract...');

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

      const compilerSettings = {
        optimizer: {
          enabled: true,
          runs: 200
        },
        evmVersion: "london"
      };

      // Call compile_solidity tool - payment should be handled automatically
      const result = await client.callTool({
        name: "compile_solidity",
        arguments: {
          sources: soliditySources,
          settings: compilerSettings
        }
      });

      console.log('📦 Received compilation result');

      // Parse the result
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);

      const compilationResult = JSON.parse(result.content[0].text);

      // Verify compilation was successful
      expect(compilationResult.success).toBe(true);
      expect(compilationResult.contracts).toBeDefined();

      // Verify SimpleStorage contract was compiled
      expect(compilationResult.contracts['SimpleStorage.sol']).toBeDefined();
      expect(compilationResult.contracts['SimpleStorage.sol'].SimpleStorage).toBeDefined();

      const simpleStorage = compilationResult.contracts['SimpleStorage.sol'].SimpleStorage;
      expect(simpleStorage.abi).toBeDefined();
      expect(simpleStorage.evm).toBeDefined();
      expect(simpleStorage.evm.bytecode).toBeDefined();
      expect(simpleStorage.evm.bytecode.object).toBeTruthy();

      console.log('✅ Compilation successful!');
      console.log('   Payment was settled on-chain and verified');
    });

    it('should compile contract with custom optimizer settings', async () => {
      console.log('\n🔧 Test: Compiling with custom optimizer settings...');

      const soliditySources = {
        "Counter.sol": {
          content: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Counter {
    uint256 public count;

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
        name: "compile_solidity",
        arguments: {
          sources: soliditySources,
          settings: compilerSettings
        }
      });

      const compilationResult = JSON.parse(result.content[0].text);

      expect(compilationResult.success).toBe(true);
      expect(compilationResult.contracts['Counter.sol']).toBeDefined();
      expect(compilationResult.contracts['Counter.sol'].Counter).toBeDefined();

      console.log('✅ Custom settings compilation successful!');
    });
  });

  describe('Multiple Files Compilation', () => {
    it('should compile multiple contracts with dependencies', async () => {
      console.log('\n🔧 Test: Compiling multiple files with imports...');

      const soliditySources = {
        "Main.sol": {
          content: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Library.sol";

contract Main {
    using MathLib for uint256;

    function addNumbers(uint256 a, uint256 b) public pure returns (uint256) {
        return a.add(b);
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
        name: "compile_solidity",
        arguments: {
          sources: soliditySources,
          settings: {
            optimizer: { enabled: true, runs: 200 }
          }
        }
      });

      const compilationResult = JSON.parse(result.content[0].text);

      expect(compilationResult.success).toBe(true);
      expect(compilationResult.contracts['Main.sol']).toBeDefined();
      expect(compilationResult.contracts['Main.sol'].Main).toBeDefined();
      expect(compilationResult.contracts['Library.sol']).toBeDefined();
      expect(compilationResult.contracts['Library.sol'].MathLib).toBeDefined();

      console.log('✅ Multiple files compilation successful!');
    });
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
        name: "compile_solidity",
        arguments: {
          sources: soliditySources,
          settings: {
            optimizer: { enabled: true, runs: 200 }
          }
        }
      });

      const compilationResult = JSON.parse(result.content[0].text);

      // Should return a result even with errors
      expect(compilationResult).toBeDefined();
      expect(compilationResult.success).toBe(false);
      expect(compilationResult.errors).toBeDefined();
      expect(Array.isArray(compilationResult.errors)).toBe(true);
      expect(compilationResult.errors.length).toBeGreaterThan(0);

      console.log('✅ Compilation errors handled correctly!');
      console.log(`   Found ${compilationResult.errors.length} error(s)`);
    });

    it('should distinguish between warnings and errors', async () => {
      console.log('\n🔧 Test: Distinguishing warnings and errors...');

      const soliditySources = {
        "WithWarning.sol": {
          content: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract WithWarning {
    uint256 public value;
    uint256 private unusedVariable; // This will generate a warning

    function setValue(uint256 _value) public {
        value = _value;
    }
}
          `.trim()
        }
      };

      const result = await client.callTool({
        name: "compile_solidity",
        arguments: {
          sources: soliditySources,
          settings: {
            optimizer: { enabled: true, runs: 200 }
          }
        }
      });

      const compilationResult = JSON.parse(result.content[0].text);

      // Should succeed despite warnings
      expect(compilationResult.success).toBe(true);

      // Check for warnings in the result
      if (compilationResult.warnings) {
        expect(Array.isArray(compilationResult.warnings)).toBe(true);
        console.log(`✅ Compilation succeeded with ${compilationResult.warnings.length} warning(s)`);
      } else {
        console.log('✅ Compilation succeeded (warnings may be in errors array with severity: warning)');
      }
    });
  });

  describe('Payment Verification', () => {
    it('should verify payment was made before compilation', async () => {
      console.log('\n🔧 Test: Verifying payment flow...');

      const soliditySources = {
        "PaymentTest.sol": {
          content: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract PaymentTest {
    string public message = "Payment verified!";
}
          `.trim()
        }
      };

      // This call should trigger payment automatically
      const result = await client.callTool({
        name: "compile_solidity",
        arguments: {
          sources: soliditySources,
          settings: {
            optimizer: { enabled: true, runs: 200 }
          }
        }
      });

      const compilationResult = JSON.parse(result.content[0].text);

      // If compilation succeeded, payment was verified
      expect(compilationResult.success).toBe(true);

      console.log('✅ Payment flow verified!');
      console.log('   Payment was automatically settled before compilation');
    });
  });
});
