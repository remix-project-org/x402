/**
 * Example: Using the /do_audit endpoint
 *
 * This example demonstrates the complete audit workflow:
 * 1. Call /get_audit_checklist to get relevant security checklist items
 * 2. Call /do_audit with the checklist to get a comprehensive security audit report
 *
 * The /do_audit endpoint:
 * - Takes contract sources and audit checklist as input
 * - Uses AI to analyze the contract against the checklist
 * - Identifies security vulnerabilities with severity levels
 * - Returns a detailed markdown report with findings and recommendations
 */

import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import dotenv from "dotenv";

dotenv.config();

// Example contract with various security considerations
const EXAMPLE_CONTRACT = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * Example Token Contract with multiple security considerations
 */
contract ExampleToken is ERC20, Ownable {
    uint256 public maxSupply = 1000000 * 10**18;
    mapping(address => bool) public blacklisted;

    event Blacklisted(address indexed account);
    event Minted(address indexed to, uint256 amount);

    constructor() ERC20("Example Token", "EXMP") Ownable(msg.sender) {
        _mint(msg.sender, 100000 * 10**18);
    }

    function mint(address to, uint256 amount) external onlyOwner {
        require(totalSupply() + amount <= maxSupply, "Exceeds max supply");
        require(!blacklisted[to], "Address is blacklisted");
        _mint(to, amount);
        emit Minted(to, amount);
    }

    function blacklist(address account) external onlyOwner {
        blacklisted[account] = true;
        emit Blacklisted(account);
    }

    function _update(address from, address to, uint256 value) internal virtual override {
        require(!blacklisted[from] && !blacklisted[to], "Blacklisted address");
        super._update(from, to, value);
    }
}`;

async function main() {
  console.log("🔍 Complete Audit Example");
  console.log("=".repeat(50));
  console.log();
  console.log("This example demonstrates the full audit workflow:");
  console.log("1. Get audit checklist with /get_audit_checklist");
  console.log("2. Perform complete audit with /do_audit");
  console.log();

  const getChecklistEndpoint = "http://localhost:8002/get_audit_checklist";
  const doAuditEndpoint = "http://localhost:8002/do_audit";

  try {
    // Setup wallet and x402 client
    console.log("💰 Setting up x402 client with EVM signer...");
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

    // Prepare contract sources
    const sources = {
      "ExampleToken.sol": {
        content: EXAMPLE_CONTRACT
      }
    };

    console.log("\n" + "=".repeat(50));
    console.log("STEP 1: Get Audit Checklist");
    console.log("=".repeat(50));
    console.log();
    console.log("📝 Analyzing contract structure to get relevant checklist items...");
    console.log(`   Endpoint: ${getChecklistEndpoint}`);
    console.log("   Contract: ExampleToken.sol");
    console.log();

    // Step 1: Call get_audit_checklist endpoint
    const checklistRequestBody = {
      sources: sources,
      maxCategories: 12
    };

    console.log("🔄 Making checklist request...");
    const checklistResponse = await x402Fetch(getChecklistEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(checklistRequestBody)
    });

    console.log(`   Response status: ${checklistResponse.status}`);

    if (!checklistResponse.ok) {
      const errorText = await checklistResponse.text();
      throw new Error(`Checklist request failed: ${checklistResponse.status} - ${errorText}`);
    }

    const checklistResult = await checklistResponse.json();

    console.log("\n✅ Checklist retrieved!");
    console.log(`   Matched Categories: ${checklistResult.matchedCategories}`);
    console.log(`   Model: ${checklistResult.model}`);
    console.log(`   Tokens Used: ${checklistResult.tokensUsed}`);
    console.log(`   Payment: 0.05 USDC`);
    console.log();

    // Step 2: Call do_audit endpoint with the checklist
    console.log("=".repeat(50));
    console.log("STEP 2: Perform Complete Security Audit");
    console.log("=".repeat(50));
    console.log();
    console.log("🔬 Performing deep security analysis...");
    console.log(`   Endpoint: ${doAuditEndpoint}`);
    console.log("   Using checklist from step 1");
    console.log();

    const auditRequestBody = {
      sources: sources,
      checklist: checklistResult.markdown
    };

    console.log("🔄 Making audit request...");
    const auditResponse = await x402Fetch(doAuditEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(auditRequestBody)
    });

    console.log(`   Response status: ${auditResponse.status}`);

    if (!auditResponse.ok) {
      const errorText = await auditResponse.text();
      throw new Error(`Audit request failed: ${auditResponse.status} - ${errorText}`);
    }

    const auditResult = await auditResponse.json();

    console.log("\n✅ Audit complete!");
    console.log();
    console.log("=".repeat(50));
    console.log("AUDIT RESULTS");
    console.log("=".repeat(50));
    console.log();
    console.log(`📊 Total Findings: ${auditResult.findingsCount}`);
    console.log();
    console.log("🎯 Severity Breakdown:");
    console.log(`   🔴 Critical: ${auditResult.severity.critical}`);
    console.log(`   🟠 High: ${auditResult.severity.high}`);
    console.log(`   🟡 Medium: ${auditResult.severity.medium}`);
    console.log(`   🟢 Low: ${auditResult.severity.low}`);
    console.log(`   ℹ️  Informational: ${auditResult.severity.informational}`);
    console.log();
    console.log(`🤖 Model: ${auditResult.model}`);
    console.log(`💰 Tokens Used: ${auditResult.tokensUsed}`);
    console.log(`💳 Payment: 0.10 USDC`);
    console.log();
    console.log("=".repeat(50));
    console.log("📄 Complete Audit Report (Markdown):");
    console.log("=".repeat(50));
    console.log();
    console.log(auditResult.markdown);
    console.log();

    // Optionally save the audit report to a file
    if (process.env.SAVE_REPORT || process.argv.includes('--save')) {
      const fs = await import('fs');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const outputPath = `./audit-report-${timestamp}.md`;
      fs.writeFileSync(outputPath, auditResult.markdown);
      console.log();
      console.log("=".repeat(50));
      console.log(`💾 Report saved to: ${outputPath}`);
      console.log("=".repeat(50));
    }

    console.log();
    console.log("=".repeat(50));
    console.log("SUMMARY");
    console.log("=".repeat(50));
    console.log();
    console.log("✅ Complete audit workflow finished successfully!");
    console.log();
    console.log("Total Cost:");
    console.log("   Step 1 (Checklist): 0.05 USDC");
    console.log("   Step 2 (Audit):     0.10 USDC");
    console.log("   ─────────────────────────────");
    console.log("   Total:              0.15 USDC");
    console.log();
    console.log("💡 Tips:");
    console.log("   • Use --save flag to save the report to a file");
    console.log("   • You can use a custom checklist instead of /get_audit_checklist");
    console.log("   • The AI analyzes your contract against ALL checklist items");
    console.log("   • Review findings and implement remediations");
    console.log();

  } catch (error) {
    console.error("\n❌ Error:", error.message);
    if (error.stack) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main };
