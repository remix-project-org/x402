/**
 * Example: Call the OpenRouter endpoint via HTTP with x402 payment
 *
 * This example demonstrates:
 * 1. Sending a smart contract to the OpenRouter endpoint
 * 2. Receiving a 402 Payment Required response
 * 3. Making payment via x402 protocol
 * 4. Receiving AI-powered contract analysis
 */

import { x402Fetch } from "@x402/fetch";

const SERVER_URL = process.env.SERVER_BASE_URL || "http://localhost:8002";
const OPENROUTER_ENDPOINT = `${SERVER_URL}/openrouter`;

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
  // Call the OpenRouter endpoint with x402 payment handling
  console.log("\n📤 Sending contract to OpenRouter for analysis...");

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

  const result = await response.json();

  console.log("\n✅ Response received!");

  if (result.success) {
    console.log("\n🔍 AI Security Analysis:");
    console.log("─".repeat(50));
    console.log(result.response);
    console.log("─".repeat(50));
    console.log(`\n📊 Model: ${result.model}`);
    console.log(`📊 Tokens used: ${result.tokensUsed}`);
  } else {
    console.log("\n❌ Request failed:", result.error);
    console.log("\n📋 Full result:");
    console.log(JSON.stringify(result, null, 2));
  }

} catch (error) {
  console.error("\n❌ Error:", error.message);
  if (error.cause) {
    console.error("Cause:", error.cause);
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
