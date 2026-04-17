import { Client, StreamableHTTPClientTransport } from "@ampersend_ai/ampersend-sdk/mcp/client";
import { AccountWallet } from "@ampersend_ai/ampersend-sdk/x402";

// Simple treasurer that auto-approves all payment requests
class NaiveTreasurer {
  constructor(wallet) {
    this.wallet = wallet;
  }

  async onPaymentRequired(requirements, _context) {
    if (requirements.length === 0) {
      return null;
    }
    // Create payment using the wallet, Automatically creates a payment for the first requirement
    const payment = await this.wallet.createPayment(requirements[0]);
    return {
      payment,
      authorizationId: crypto.randomUUID(),
    };
  }
  // Logs payment status updates to the console
  async onStatus(status, authorization, _context) {
    console.log(`[Payment] ${authorization.authorizationId}: ${status}`);
  }
}

// TODO: Replace with your actual private key (without the 0x prefix if needed)
// Example: "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
const wallet = new AccountWallet("YOUR_PRIVATE_KEY_HERE");
const treasurer = new NaiveTreasurer(wallet);

const client = new Client(
  { name: "MyMCPClient", version: "1.0.0" },
  {
    mcpOptions: { capabilities: { tools: {} } },
    treasurer,
  }
);

const transport = new StreamableHTTPClientTransport(
  new URL("http://localhost:8000/mcp")
);

console.log("🔌 Connecting to MCP server...");
await client.connect(transport);
console.log("✅ Connected!");

console.log("🔧 Calling paid_tool...");
const result = await client.callTool({ name: "paid_tool", arguments: { query: "test query" } });
console.log("📦 Result:", result);

await client.close();
console.log("👋 Disconnected");