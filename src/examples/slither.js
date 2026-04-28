import { createMCPClient } from "../client/index.js";

// Create Ampersend MCP client with automatic payment handling
const { client, transport } = createMCPClient("http://localhost:8000/mcp");

console.log("🔌 Connecting to MCP server...");
await client.connect(transport);
console.log("✅ Connected!");

// Test contract with a known vulnerability (reentrancy)
const vulnerableContract = {
  "VulnerableBank.sol": {
    content: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract VulnerableBank {
    mapping(address => uint256) public balances;

    function deposit() public payable {
        balances[msg.sender] += msg.value;
    }

    // Vulnerable to reentrancy attack
    function withdraw(uint256 _amount) public {
        require(balances[msg.sender] >= _amount, "Insufficient balance");

        // External call before state update - VULNERABLE!
        (bool success, ) = msg.sender.call{value: _amount}("");
        require(success, "Transfer failed");

        balances[msg.sender] -= _amount; // State updated after external call
    }

    // Using tx.origin for authentication - BAD PRACTICE!
    function transferOwnership(address newOwner) public {
        require(tx.origin == msg.sender, "Not authorized");
        // ownership transfer logic
    }

    function getBalance() public view returns (uint256) {
        return balances[msg.sender];
    }
}
    `.trim()
  }
};

console.log("\n🔍 Running Slither security analysis...");

try {
  const result = await client.callTool({
    name: "analyze_with_slither",
    arguments: {
      sources: vulnerableContract,
      excludeInformational: false,
      excludeLow: false
    }
  });

  // Parse the result from MCP tool response
  let analysisResult;
  if (result.content && result.content[0] && result.content[0].text) {
    analysisResult = JSON.parse(result.content[0].text);
  } else {
    analysisResult = result;
  }

  if (analysisResult.success) {
    console.log("\n✅ Analysis completed successfully!");
    console.log("   (Payment was settled on-chain and verified before analysis)");

    const summary = analysisResult.summary;
    console.log("\n📋 Summary:");
    console.log(`   Total Findings: ${summary.totalFindings}`);
    console.log(`   High Severity: ${summary.high}`);
    console.log(`   Medium Severity: ${summary.medium}`);
    console.log(`   Low Severity: ${summary.low}`);
    console.log(`   Informational: ${summary.informational}`);
    console.log(`   Optimization: ${summary.optimization}`);

    if (analysisResult.findings && analysisResult.findings.length > 0) {
      console.log("\n🐛 Detailed Findings:");
      analysisResult.findings.forEach((finding, idx) => {
        console.log(`\n  ${idx + 1}. [${finding.impact}] ${finding.check}`);
        console.log(`     Confidence: ${finding.confidence}`);
        if (finding.description) {
          // Print first few lines of description
          const descLines = finding.description.split('\n').filter(line => line.trim());
          descLines.slice(0, 3).forEach(line => {
            console.log(`     ${line}`);
          });
          if (descLines.length > 3) {
            console.log(`     ... (${descLines.length - 3} more lines)`);
          }
        }
        if (finding.reference) {
          console.log(`     Reference: ${finding.reference}`);
        }
      });
    }
  } else {
    console.log("\n❌ Analysis failed!");
    if (analysisResult.error) {
      console.log(`\n🐛 Error: ${analysisResult.error}`);
    }
  }
} catch (error) {
  console.error("\n❌ Error:", error.message);
  if (error.stack) {
    console.error(error.stack);
  }
}

await client.close();
console.log("\n👋 Disconnected");
