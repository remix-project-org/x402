import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import dotenv from "dotenv";

dotenv.config();

// HTTP x402 v2 endpoint - production
const httpEndpoint = "http://localhost:8002/analyze";

console.log("🔌 Making payment to production HTTP x402 v2 endpoint...");
console.log(`   Endpoint: ${httpEndpoint}`);

const soliditySources = {
  "VulnerableContract.sol": {
    content: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract VulnerableContract {
    mapping(address => uint256) public balances;

    function deposit() public payable {
        balances[msg.sender] += msg.value;
    }

    // Potential reentrancy vulnerability - withdraw before updating balance
    function withdraw() public {
        uint256 amount = balances[msg.sender];
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");
        balances[msg.sender] = 0;
    }

    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }
}
    `.trim()
  }
};

try {
  // Setup wallet and x402 client
  console.log("\n💰 Setting up x402 client with EVM signer...");
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("PRIVATE_KEY must be set in .env file");
  }

  const evmSigner = privateKeyToAccount(privateKey);
  console.log(`   Wallet address: ${evmSigner.address}`);

  // Create x402 client with ExactEvmScheme for Base Mainnet
  // Following official example from coinbase/x402 repo
  const client = new x402Client();

  // Configure ExactEvmScheme - it automatically detects token and chain from payment requirements
  const exactScheme = new ExactEvmScheme(evmSigner);

  console.log(`   Client configured with ExactEvmScheme`);

  // Register the scheme for eip155:8453 (Base Mainnet)
  client.register("eip155:84532", exactScheme);

  console.log("   ✅ x402 client configured with ExactEvmScheme");

  // Wrap fetch with x402 payment handling
  const x402Fetch = wrapFetchWithPayment(fetch, client);

  console.log("   ✅ Payment-enabled fetch ready");

  // Use x402-enabled fetch to make the request with automatic payment handling
  console.log("\n🔧 Making request with x402-enabled fetch...");
  console.log("   x402/fetch will automatically:");
  console.log("   1. Detect 402 Payment Required response");
  console.log("   2. Settle payment via facilitator");
  console.log("   3. Retry request with payment proof");
  console.log("   4. This triggers indexing on agentic.market!");

  const requestBody = {
    sources: soliditySources,
    version: "v0.8.35+commit.47b9dedd",
    excludeInformational: false
  };

  // Make the request - x402Fetch handles payment automatically
  console.log("\n🔄 Making request...");
  const response = await x402Fetch(httpEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  console.log(`\n📡 Response status: ${response.status}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Request failed: ${response.status} - ${errorText}`);
  }

  const result = await response.json();

  console.log("\n📦 Analysis Result:");
  console.log(JSON.stringify(result, null, 2));

  if (result.success) {
    console.log("\n✅ Analysis completed successfully!");
    console.log("   (Payment was settled on-chain and verified before analysis)");
    console.log("\n🎯 IMPORTANT: This payment triggers automatic indexing!");
    console.log("   Your endpoint should appear on agentic.market within ~10 minutes");
    console.log("   Check: https://agentic.market");

    if (result.summary) {
      console.log("\n📊 Security Summary:");
      console.log(`   Total Findings: ${result.summary.totalFindings || 0}`);
      console.log(`   High Severity: ${result.summary.high || 0}`);
      console.log(`   Medium Severity: ${result.summary.medium || 0}`);
      console.log(`   Low Severity: ${result.summary.low || 0}`);
      console.log(`   Informational: ${result.summary.informational || 0}`);
    }

    if (result.findings && result.findings.length > 0) {
      console.log("\n🔍 Findings:");
      result.findings.forEach((finding, index) => {
        console.log(`\n  ${index + 1}. ${finding.check || 'Unknown'}`);
        console.log(`     Impact: ${finding.impact || 'N/A'}`);
        console.log(`     Confidence: ${finding.confidence || 'N/A'}`);
        if (finding.description) {
          console.log(`     Description: ${finding.description}`);
        }
      });
    } else {
      console.log("\n✨ No security issues found!");
    }
  } else {
    console.log("\n❌ Analysis failed!");
    if (result.errors) {
      console.log("\n🐛 Errors:");
      result.errors.forEach(err => {
        console.log(`  - ${err.message || err}`);
      });
    }
  }
} catch (error) {
  console.error("\n❌ Error:", error.message);
  if (error.stack) {
    console.error("\nStack trace:");
    console.error(error.stack);
  }
}

console.log("\n👋 Done");
