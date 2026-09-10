/**
 * Example: Using the /get_audit_checklist endpoint
 *
 * This endpoint analyzes smart contract code and returns a markdown report
 * containing relevant security audit checklist items matched by AI.
 *
 * The endpoint:
 * 1. Takes Solidity contract code as input
 * 2. Strips the code to skeleton (declarations only)
 * 3. Uses OpenRouter AI to match relevant audit categories
 * 4. Returns a detailed markdown report with matched checklist items
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
  console.log("🔍 Audit Checklist Example");
  console.log("=" .repeat(50));
  console.log();

  const httpEndpoint = "http://localhost:8002/get_audit_checklist";

  console.log(`   Endpoint: ${httpEndpoint}`);

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

    console.log("\n📝 Analyzing contract...");
    console.log("Contract: ExampleToken.sol");
    console.log();

    // Call the get_audit_checklist endpoint
    const requestBody = {
      sources: {
        "ExampleToken.sol": {
          content: EXAMPLE_CONTRACT
        }
      },
      maxCategories: 12  // Optional: limit number of matched categories (default: 12, max: 20)
    };

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

    console.log("\n✅ Analysis complete!");
    console.log();
    console.log(`📊 Matched Categories: ${result.matchedCategories}`);
    console.log(`🤖 Model: ${result.model}`);
    console.log(`💰 Tokens Used: ${result.tokensUsed}`);
    console.log();
    console.log("=" .repeat(50));
    console.log("📄 Markdown Report:");
    console.log("=" .repeat(50));
    console.log();
    console.log(result.markdown);

    // Optionally save the markdown report to a file
    if (process.env.SAVE_REPORT) {
      const fs = await import('fs');
      const outputPath = './audit-report.md';
      fs.writeFileSync(outputPath, result.markdown);
      console.log();
      console.log(`💾 Report saved to: ${outputPath}`);
    }

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
