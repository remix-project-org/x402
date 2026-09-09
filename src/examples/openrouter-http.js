/**
 * Example: Call the OpenRouter endpoint via HTTP with x402 payment
 *
 * This example demonstrates:
 * 1. Sending a smart contract to the OpenRouter endpoint
 * 2. Receiving a 402 Payment Required response
 * 3. Making payment via x402 protocol
 * 4. Receiving AI-powered contract analysis
 */

import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import dotenv from "dotenv";

dotenv.config();

// Use local server for testing (production endpoint not deployed yet)
const SERVER_URL = "http://localhost:8002";
const OPENROUTER_ENDPOINT = `${SERVER_URL}/get_audit_checklist`;

console.log("🤖 OpenRouter Smart Contract Analyzer");
console.log(`📡 Endpoint: ${OPENROUTER_ENDPOINT}`);
console.log("=" .repeat(50));

// Example contract with potential security issues
const contractSources = {
  "MyToken.sol": {
    content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MyToken {
    string public name = "MyToken";
    mapping(address => uint256) public balances;

    // Missing access control - anyone can mint!
    function mint(address to, uint256 amount) public {
        balances[to] += amount;
    }

    // Potential reentrancy issue
    function withdraw() public {
        uint256 amount = balances[msg.sender];
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success);
        balances[msg.sender] = 0;
    }
}`
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

  // Create x402 client with ExactEvmScheme for Base Sepolia
  const client = new x402Client();
  const exactScheme = new ExactEvmScheme(evmSigner);

  console.log(`   Client configured with ExactEvmScheme`);

  // Register the scheme for eip155:84532 (Base Sepolia)
  client.register("eip155:84532", exactScheme);

  console.log("   ✅ x402 client configured with ExactEvmScheme");

  // Wrap fetch with x402 payment handling
  const x402Fetch = wrapFetchWithPayment(fetch, client);

  console.log("   ✅ Payment-enabled fetch ready");

  // Call the OpenRouter endpoint with x402 payment handling
  console.log("\n📤 Sending contract to OpenRouter for analysis...");
  console.log("   x402/fetch will automatically:");
  console.log("   1. Detect 402 Payment Required response");
  console.log("   2. Settle payment via facilitator");
  console.log("   3. Retry request with payment proof");

  const response = await x402Fetch(OPENROUTER_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      sources: contractSources,
      prompt: "Analyze this token contract for security vulnerabilities and provide recommendations",
      task: "analyze",
      maxTokens: 1000
    })
  });

  console.log(`\n📡 Response status: ${response.status}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Request failed: ${response.status} - ${errorText}`);
  }

  const result = await response.json();

  console.log("\n✅ Response received!");

  if (result.success) {
    console.log("\n🔍 AI Security Analysis:");
    console.log("─".repeat(50));
    console.log(result.response);
    console.log("─".repeat(50));
    console.log(`\n📊 Model: ${result.model}`);
    console.log(`📊 Tokens used: ${result.tokensUsed}`);
    console.log("\n🎯 Payment was settled on-chain and verified before analysis");
  } else {
    console.log("\n❌ Request failed:", result.error);
    console.log("\n📋 Full result:");
    console.log(JSON.stringify(result, null, 2));
  }

} catch (error) {
  console.error("\n❌ Error:", error.message);
  if (error.stack) {
    console.error("\nStack trace:");
    console.error(error.stack);
  }
}

console.log("\n" + "=".repeat(50));
console.log("✨ Example complete");

// Additional examples you can try:
console.log("\n💡 Other tasks you can try:");
console.log("   - task: 'explain' - Get a detailed explanation of the contract");
console.log("   - task: 'optimize' - Get gas optimization suggestions");
console.log("   - task: 'generate' - Generate new contract code based on description");
console.log("   - prompt without sources - Ask general Solidity questions");
