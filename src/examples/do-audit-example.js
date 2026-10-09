/**
 * Example: Using the /do_audit endpoint
 *
 * This example demonstrates the complete audit workflow:
 * 1. Call /get_audit_checklist to get relevant security checklist items
 * 2. Call /do_audit with the checklist to get a comprehensive security audit report
 *
 * The endpoints support 3 AI models with automatic fallbacks:
 * - DeepSeek (Budget):  $0.05 checklist, $0.15 audit - Fast and cost-effective
 * - Sonnet (Premium):   $0.15 checklist, $0.25 audit - High quality analysis
 * - Fable (Ultra):      $0.30 checklist, $0.70 audit - Premium deep analysis
 *
 * Each model has 3 fallback models for reliability:
 * - If primary model fails, automatically tries fallback models
 * - Response includes the actual model used (primary or fallback)
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
  console.log("Available Models (with automatic fallbacks):");
  console.log("  • DeepSeek: $0.05 + $0.15 = $0.20 total (budget tier)");
  console.log("  • Sonnet:   $0.15 + $0.25 = $0.40 total (premium tier)");
  console.log("  • Fable:    $0.30 + $0.70 = $1.00 total (ultra premium tier)");
  console.log();

  // Allow model selection via command line argument
  const modelArg = process.argv.find(arg => arg.startsWith('--model='));
  const selectedModel = modelArg ? modelArg.split('=')[1] : 'DeepSeek';

  if (!['DeepSeek', 'Sonnet', 'Fable'].includes(selectedModel)) {
    console.error(`❌ Invalid model: ${selectedModel}`);
    console.error('   Must be one of: DeepSeek, Sonnet, Fable');
    process.exit(1);
  }

  console.log(`🤖 Selected Model: ${selectedModel}`);
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
    console.log(`   Model: ${selectedModel}`);
    console.log("   Contract: ExampleToken.sol");
    console.log();

    // Step 1: Call get_audit_checklist endpoint
    const checklistRequestBody = {
      model: selectedModel,  // Add model parameter
      sources: sources,
      maxCategories: 12
    };

    console.log("🔄 Making checklist request...");
    const checklistResponse = await x402Fetch(getChecklistEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept-Encoding": "gzip"  // Request gzip compression
      },
      body: JSON.stringify(checklistRequestBody)
    });

    console.log(`   Response status: ${checklistResponse.status}`);

    // Check for compression
    const contentEncoding = checklistResponse.headers.get('content-encoding');
    const contentLength = checklistResponse.headers.get('content-length');
    if (contentEncoding === 'gzip') {
      console.log(`   ✅ Response compressed with gzip (size: ${contentLength} bytes)`);
    } else {
      console.log(`   ℹ️  Response not compressed (size: ${contentLength || 'unknown'} bytes)`);
    }

    if (!checklistResponse.ok) {
      const errorText = await checklistResponse.text();
      throw new Error(`Checklist request failed: ${checklistResponse.status} - ${errorText}`);
    }

    const checklistResult = await checklistResponse.json();

    // Calculate payment based on selected model
    const checklistPrices = {
      DeepSeek: "0.05",
      Sonnet: "0.15",
      Fable: "0.30"
    };

    console.log("\n✅ Checklist retrieved!");
    console.log(`   Matched Categories: ${checklistResult.matchedCategories}`);
    console.log(`   Requested Model: ${selectedModel}`);
    console.log(`   Actual Model Used: ${checklistResult.model}`);
    console.log(`   Tokens Used: ${checklistResult.tokensUsed}`);
    console.log(`   Payment: ${checklistPrices[selectedModel]} USDC`);

    if (checklistResult.model !== selectedModel && !checklistResult.model.includes(selectedModel.toLowerCase())) {
      console.log(`   ⚠️  Fallback model was used (primary model may have been unavailable)`);
    }
    console.log();

    // Step 2: Call do_audit endpoint with the checklist
    console.log("=".repeat(50));
    console.log("STEP 2: Perform Complete Security Audit");
    console.log("=".repeat(50));
    console.log();
    console.log("🔬 Performing deep security analysis...");
    console.log(`   Endpoint: ${doAuditEndpoint}`);
    console.log(`   Model: ${selectedModel}`);
    console.log("   Using checklist from step 1");
    console.log();

    const auditRequestBody = {
      model: selectedModel,  // Add model parameter
      sources: sources,
      checklist: checklistResult.markdown
    };

    console.log("🔄 Making audit request...");
    const auditResponse = await x402Fetch(doAuditEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept-Encoding": "gzip"  // Request gzip compression
      },
      body: JSON.stringify(auditRequestBody)
    });

    console.log(`   Response status: ${auditResponse.status}`);

    // Check for compression
    const auditContentEncoding = auditResponse.headers.get('content-encoding');
    const auditContentLength = auditResponse.headers.get('content-length');
    if (auditContentEncoding === 'gzip') {
      console.log(`   ✅ Response compressed with gzip (size: ${auditContentLength} bytes)`);
    } else {
      console.log(`   ℹ️  Response not compressed (size: ${auditContentLength || 'unknown'} bytes)`);
    }

    if (!auditResponse.ok) {
      const errorText = await auditResponse.text();
      throw new Error(`Audit request failed: ${auditResponse.status} - ${errorText}`);
    }

    const auditResult = await auditResponse.json();

    // Calculate payment based on selected model
    const auditPrices = {
      DeepSeek: "0.15",
      Sonnet: "0.25",
      Fable: "0.70"
    };

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
    console.log(`🤖 Requested Model: ${selectedModel}`);
    console.log(`🤖 Actual Model Used: ${auditResult.model}`);
    console.log(`💰 Tokens Used: ${auditResult.tokensUsed}`);
    console.log(`💳 Payment: ${auditPrices[selectedModel]} USDC`);

    if (auditResult.model !== selectedModel && !auditResult.model.includes(selectedModel.toLowerCase())) {
      console.log(`   ⚠️  Fallback model was used (primary model may have been unavailable)`);
    }
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

    // Calculate total cost
    const totalCost = (
      parseFloat(checklistPrices[selectedModel]) +
      parseFloat(auditPrices[selectedModel])
    ).toFixed(2);

    console.log();
    console.log("=".repeat(50));
    console.log("SUMMARY");
    console.log("=".repeat(50));
    console.log();
    console.log("✅ Complete audit workflow finished successfully!");
    console.log();
    console.log(`Selected Model: ${selectedModel}`);
    console.log();
    console.log("Compression Status:");
    console.log(`   Checklist Response: ${contentEncoding === 'gzip' ? '✅ Compressed' : '❌ Not compressed'}`);
    console.log(`   Audit Response:     ${auditContentEncoding === 'gzip' ? '✅ Compressed' : '❌ Not compressed'}`);
    console.log();
    console.log("Total Cost:");
    console.log(`   Step 1 (Checklist): ${checklistPrices[selectedModel]} USDC`);
    console.log(`   Step 2 (Audit):     ${auditPrices[selectedModel]} USDC`);
    console.log("   ─────────────────────────────");
    console.log(`   Total:              ${totalCost} USDC`);
    console.log();
    console.log("💡 Tips:");
    console.log("   • Use --model=Sonnet or --model=Fable for higher quality analysis");
    console.log("   • Use --save flag to save the report to a file");
    console.log("   • Each model has 3 automatic fallbacks for reliability");
    console.log("   • Response shows which model actually processed your request");
    console.log("   • You can use a custom checklist instead of /get_audit_checklist");
    console.log();
    console.log("Model Options:");
    console.log("   node src/examples/do-audit-example.js --model=DeepSeek");
    console.log("   node src/examples/do-audit-example.js --model=Sonnet");
    console.log("   node src/examples/do-audit-example.js --model=Fable");
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
