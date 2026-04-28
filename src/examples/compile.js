import { createMCPClient } from "../client/index.js";

// Create Ampersend MCP client with automatic payment handling
const { client, transport } = createMCPClient("http://localhost:8000/mcp");

console.log("🔌 Connecting to MCP server...");
await client.connect(transport);
console.log("✅ Connected!");

// Call compile_solidity endpoint - payments are handled automatically by Ampersend SDK
console.log("\n🔧 Compiling Solidity contract...");

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

try {
  // Call tool - treasurer will automatically settle payment on-chain
  // before returning authorization, then server will verify it
  const result = await client.callTool({
    name: "compile_solidity",
    arguments: {
      sources: soliditySources,
      settings: compilerSettings
    }
  });

  console.log("\n📦 Raw MCP Response:");
  console.log(JSON.stringify(result, null, 2));

  // Parse the result from MCP tool response
  let compilationResult;
  if (result.content && result.content[0] && result.content[0].text) {
    // The result is in the text field of the content array
    compilationResult = JSON.parse(result.content[0].text);
  } else {
    compilationResult = result;
  }

  console.log("\n📦 Compilation Result:");
  console.log(JSON.stringify(compilationResult, null, 2));

  if (compilationResult.success) {
    console.log("\n✅ Compilation successful!");
    console.log("   (Payment was settled on-chain and verified before compilation)");
    if (compilationResult.contracts) {
      console.log("\n📄 Compiled Contracts:");
      Object.keys(compilationResult.contracts).forEach(file => {
        Object.keys(compilationResult.contracts[file]).forEach(contractName => {
          console.log(`  - ${file}:${contractName}`);
        });
      });
    }
  } else {
    console.log("\n❌ Compilation failed!");
    if (compilationResult.errors) {
      console.log("\n🐛 Errors:");
      compilationResult.errors.forEach(err => {
        console.log(`  - ${err.message || err}`);
      });
    }
  }
} catch (error) {
  console.error("\n❌ Error:", error.message);
}

await client.close();
console.log("\n👋 Disconnected");
