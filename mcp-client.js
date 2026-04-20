import { createMCPClient, callToolWithPayment } from "./src/client/index.js";

// Create client with x402 payment support
const { client, transport } = createMCPClient("http://localhost:8000/mcp");

console.log("🔌 Connecting to MCP server...");
await client.connect(transport);
console.log("✅ Connected!");

console.log("\n🔧 Calling paid_tool...");

try {
  const result = await callToolWithPayment(client, "paid_tool", { query: "test query" });
  console.log("\n📦 Result:", JSON.stringify(result, null, 2));
} catch (error) {
  console.error("\n❌ Error:", error.message);
}

await client.close();
console.log("\n👋 Disconnected");
