import { createMCPClient } from "../lib/index.js";

// Create Ampersend MCP client with automatic payment handling
const { client, transport } = createMCPClient("http://localhost:8000/mcp");

console.log("🔌 Connecting to MCP server...");
await client.connect(transport);
console.log("✅ Connected!");

// Example: Multi-Network Deployment
// Deploy the same contract to multiple networks in one call
console.log("\n🚀 Example: Multi-Network Deployment");
console.log("   (Server will deploy to multiple networks using one compilation)");

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
  console.log("\n💰 Payment: Dynamic pricing based on all networks");
  console.log("   Server will estimate gas for each network and calculate total cost");
  console.log("🔐 Security: Your private key stays with you - server uses its own deployer wallet");

  // Call multi-network deployment tool
  // Server will compile once and deploy to all specified networks
  const result = await client.callTool({
    name: "compile_and_deploy_multi_network",
    arguments: {
      sources: soliditySources,
      contractName: "SimpleStorage",
      contractFile: "SimpleStorage.sol",
      constructorArgs: [42], // Initial value for the constructor
      settings: compilerSettings,
      networks: ["base-sepolia", "sepolia"] // Deploy to multiple networks
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

  console.log("\n📦 Multi-Network Deployment Result:");
  console.log(JSON.stringify(deploymentResult, null, 2));

  if (deploymentResult.success) {
    console.log("\n✅ Multi-network deployment successful!");
    console.log(`   Deployed to ${deploymentResult.summary.successful}/${deploymentResult.summary.total} networks`);

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
    deploymentResult.deployments.forEach((deployment, index) => {
      console.log(`\n  Network ${index + 1}: ${deployment.network}`);
      if (deployment.success) {
        console.log(`    ✅ Success`);
        console.log(`    Contract Address: ${deployment.contractAddress}`);
        console.log(`    Transaction Hash: ${deployment.transactionHash}`);
        console.log(`    Block Number: ${deployment.blockNumber}`);
        console.log(`    Gas Used: ${deployment.gasUsed}`);

        // Add block explorer link
        let explorerUrl = "";
        if (deployment.network === "base-sepolia") {
          explorerUrl = `https://sepolia.basescan.org/address/${deployment.contractAddress}`;
        } else if (deployment.network === "sepolia") {
          explorerUrl = `https://sepolia.etherscan.io/address/${deployment.contractAddress}`;
        } else if (deployment.network === "polygon-amoy") {
          explorerUrl = `https://amoy.polygonscan.com/address/${deployment.contractAddress}`;
        } else if (deployment.network === "avalanche-fuji") {
          explorerUrl = `https://testnet.snowtrace.io/address/${deployment.contractAddress}`;
        }
        if (explorerUrl) {
          console.log(`    Explorer: ${explorerUrl}`);
        }

        if (deployment.postDeploymentCall) {
          console.log(`    Post-deployment call: ${deployment.postDeploymentCall.methodName}`);
          console.log(`      Status: ${deployment.postDeploymentCall.success ? "✅ Success" : "❌ Failed"}`);
        }
      } else {
        console.log(`    ❌ Failed: ${deployment.error}`);
      }
    });

    console.log("\n💡 How it works:");
    console.log("  1. You paid one USDC amount via X402 payment system");
    console.log("  2. Server verified payment on-chain");
    console.log("  3. Server compiled your contract once");
    console.log("  4. Server deployed to all networks using its funded wallet");
    console.log("  5. Your USDC payment covers all gas costs + service fee");
    console.log("  6. Your private key never left your client!");
  } else {
    console.log("\n❌ Multi-network deployment failed!");
    if (deploymentResult.error) {
      console.log(`\n🐛 Error: ${deploymentResult.error}`);
    }
    if (deploymentResult.deployments) {
      console.log("\n📋 Individual deployment results:");
      deploymentResult.deployments.forEach(deployment => {
        console.log(`  ${deployment.network}: ${deployment.success ? "✅ Success" : "❌ Failed"}`);
        if (!deployment.success) {
          console.log(`    Error: ${deployment.error}`);
        }
      });
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
