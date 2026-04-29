import { createMCPClient } from "../client/index.js";

// Create Ampersend MCP client with automatic payment handling
const { client, transport } = createMCPClient("http://localhost:8000/mcp");

console.log("🔌 Connecting to MCP server...");
await client.connect(transport);
console.log("✅ Connected!");

// Example: Compile and Deploy Only
// The server will compile and deploy the contract using its own funded wallet
// Client pays 0.05 USDC to cover gas costs + service fee
console.log("\n🚀 Example: Compile and Deploy Only");
console.log("   (Server will deploy using its own funded wallet)");

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

try {
  console.log("\n💰 Payment: Dynamic pricing (gas cost + 30% service fee + 0.05 USDC base fee)");
  console.log("   Server will estimate deployment gas and calculate total cost");
  console.log("🔐 Security: Your private key stays with you - server uses its own deployer wallet");

  // Call tool - treasurer will automatically settle payment on-chain
  // Server will compile and deploy using its delegated deployer wallet
  const result = await client.callTool({
    name: "compile_and_deploy",
    arguments: {
      sources: soliditySources,
      contractName: "SimpleStorage",
      contractFile: "SimpleStorage.sol",
      constructorArgs: [42], // Initial value for the constructor
      settings: compilerSettings,
      network: "base-sepolia" // Deploy to Base Sepolia testnet
    }
  });

  console.log("\n📦 Raw MCP Response:");
  console.log(JSON.stringify(result, null, 2));

  // Parse the result from MCP tool response
  let deploymentResult;
  if (result.content && result.content[0] && result.content[0].text) {
    deploymentResult = JSON.parse(result.content[0].text);
  } else {
    deploymentResult = result;
  }

  console.log("\n📦 Deployment Result:");
  console.log(JSON.stringify(deploymentResult, null, 2));

  if (deploymentResult.success) {
    console.log("\n✅ Deployment successful!");
    console.log("   (Payment was settled and server deployed the contract)");

    console.log("\n📄 Compilation Details:");
    if (deploymentResult.compilation && deploymentResult.compilation.warnings.length > 0) {
      console.log("  ⚠️  Warnings:");
      deploymentResult.compilation.warnings.forEach(warning => {
        console.log(`    - ${warning.message || warning}`);
      });
    } else {
      console.log("  ✅ No warnings");
    }

    console.log("\n📄 Deployment Details:");
    console.log(`  Success: ${deploymentResult.deployment.success}`);
    console.log(`  Contract Address: ${deploymentResult.deployment.contractAddress}`);
    console.log(`  Transaction Hash: ${deploymentResult.deployment.transactionHash}`);
    console.log(`  Block Number: ${deploymentResult.deployment.blockNumber}`);
    console.log(`  Gas Used: ${deploymentResult.deployment.gasUsed}`);
    console.log(`  Network: ${deploymentResult.deployment.network}`);
    console.log(`  Deployed By: ${deploymentResult.deployment.deployedBy}`);
    console.log(`  Deployer Address: ${deploymentResult.deployment.deployerAddress}`);

    console.log("\n🔗 View on Block Explorer:");
    const explorerUrl = `https://sepolia.basescan.org/address/${deploymentResult.deployment.contractAddress}`;
    console.log(`  ${explorerUrl}`);

    console.log("\n💡 How it works:");
    console.log("  1. You paid 0.05 USDC via X402 payment system");
    console.log("  2. Server verified payment on-chain");
    console.log("  3. Server compiled your contract");
    console.log("  4. Server deployed using its funded wallet (gas paid by server)");
    console.log("  5. Your USDC payment covers server's gas costs + service fee");
    console.log("  6. Your private key never left your client!");
  } else {
    console.log("\n❌ Operation failed!");
    if (deploymentResult.message) {
      console.log(`\n⚠️  ${deploymentResult.message}`);
    }
    if (deploymentResult.error) {
      console.log(`\n🐛 Error: ${deploymentResult.error}`);
    }
    if (deploymentResult.details) {
      console.log("\n📋 Details:");
      console.log(JSON.stringify(deploymentResult.details, null, 2));
    }
  }
} catch (error) {
  console.error("\n❌ Error:", error.message);
  if (error.stack) {
    console.error("\n📋 Stack trace:");
    console.error(error.stack);
  }
}

await client.close();
console.log("\n👋 Disconnected");

// https://sepolia.basescan.org/address/0x92f2109c434260439244cb15da0abea34b0023fc
