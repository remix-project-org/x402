import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@ampersend_ai/ampersend-sdk/mcp/client";
import { AccountWallet } from "@ampersend_ai/ampersend-sdk/x402";

// Simple treasurer that auto-approves all payment requests
class NaiveTreasurer {
  constructor(wallet) {
    this.wallet = wallet;
  }

  async onPaymentRequired(requirements, _context) {
    if (requirements.length === 0) return null;

    console.log("💰 Payment required:");
    console.log(`   Amount: ${requirements[0].maxAmountRequired}`);

    const payment = await this.wallet.createPayment(requirements[0]);
    return {
      payment,
      authorizationId: crypto.randomUUID(),
    };
  }

  async onStatus(status, authorization) {
    console.log(`[Payment] ${status}`);
  }
}

// Using Hardhat's default test account #0 (safe for testing only)
const SAMPLE_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const wallet = AccountWallet.fromPrivateKey(process.env.PRIVATE_KEY || SAMPLE_PRIVATE_KEY);

console.log(`💼 Wallet address: ${wallet.address}`);

const treasurer = new NaiveTreasurer(wallet);
const client = new McpClient(
  { name: "MyMCPClient", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

const transport = new StreamableHTTPClientTransport(new URL("http://localhost:8000/mcp"));

// Track requests for payment retry
const pendingRequests = new Map();
const pendingResolvers = new Map();
const originalSend = transport.send.bind(transport);
const originalOnMessage = transport.onmessage;

transport.send = (message) => {
  if ("id" in message && "method" in message) {
    pendingRequests.set(message.id, message);
  }
  return originalSend(message);
};

// Handle x402 payment flow
transport.onmessage = async (response) => {
  // Handle 402 Payment Required
  if ("id" in response && "error" in response && response.error?.code === 402) {
    const originalRequest = pendingRequests.get(response.id);

    if (originalRequest && response.error?.data?.x402Version && response.error?.data?.accepts) {
      // Avoid retry loop
      if (originalRequest.params?._meta?.["x402/payment"]) {
        if (originalOnMessage) originalOnMessage(response);
        return;
      }

      const authorization = await treasurer.onPaymentRequired(
        response.error.data.accepts,
        { method: originalRequest.method, params: originalRequest.params }
      );

      if (!authorization) {
        if (originalOnMessage) originalOnMessage(response);
        return;
      }

      await treasurer.onStatus("sending", authorization);

      // Retry with payment
      const retryRequest = {
        ...originalRequest,
        params: {
          ...originalRequest.params,
          _meta: {
            ...originalRequest.params?._meta,
            "x402/payment": authorization.payment,
          }
        }
      };

      pendingResolvers.set(originalRequest.id, authorization);
      originalSend(retryRequest);
      return;
    }
  }

  // Handle successful payment
  if ("id" in response && "result" in response) {
    const authorization = pendingResolvers.get(response.id);
    if (authorization) {
      await treasurer.onStatus("accepted", authorization);
      pendingResolvers.delete(response.id);

      if (globalThis.__retryResolver) {
        globalThis.__retryResolver(response.result);
        globalThis.__retryResolver = null;
      }
    }
  }

  if ("id" in response) pendingRequests.delete(response.id);
  if (originalOnMessage) originalOnMessage(response);
};

console.log("🔌 Connecting to MCP server...");
await client.connect(transport);
console.log("✅ Connected!");

console.log("\n🔧 Calling paid_tool...");

let retryResolver;
const retryPromise = new Promise((resolve) => { retryResolver = resolve; });
globalThis.__retryResolver = retryResolver;

try {
  const result = await client.callTool({ name: "paid_tool", arguments: { query: "test query" } });
  console.log("\n📦 Result:", JSON.stringify(result, null, 2));
} catch (error) {
  if (error.code === 402) {
    console.log("\n⏳ Waiting for payment retry...");
    const retryResult = await retryPromise;
    console.log("\n📦 Result (after payment):", JSON.stringify(retryResult, null, 2));
  } else {
    console.error("\n❌ Error:", error.message);
  }
}

await client.close();
console.log("\n👋 Disconnected");
