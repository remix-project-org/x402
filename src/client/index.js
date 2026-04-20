import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@ampersend_ai/ampersend-sdk/mcp/client";
import { NaiveTreasurer } from "./treasurer.js";
import { X402TransportWrapper } from "./transport.js";
import { createWallet } from "./wallet.js";

/**
 * Creates and configures an MCP client with x402 payment support
 * @param {string} serverUrl - The MCP server URL
 * @param {Object} clientInfo - Client information (name, version)
 * @returns {Object} Configured client and transport
 */
export function createMCPClient(serverUrl, clientInfo = { name: "MyMCPClient", version: "1.0.0" }) {
  // Initialize wallet and treasurer
  const wallet = createWallet();
  const treasurer = new NaiveTreasurer(wallet);

  // Create MCP client
  const client = new McpClient(
    clientInfo,
    { capabilities: { tools: {} } }
  );

  // Create transport with x402 payment support
  const transport = new StreamableHTTPClientTransport(new URL(serverUrl));
  new X402TransportWrapper(transport, treasurer);

  return { client, transport };
}

/**
 * Calls a tool on the MCP server with automatic payment retry support
 * @param {McpClient} client - The MCP client instance
 * @param {string} toolName - Name of the tool to call
 * @param {Object} args - Tool arguments
 * @returns {Promise<Object>} Tool result
 */
export async function callToolWithPayment(client, toolName, args) {
  let retryResolver;
  const retryPromise = new Promise((resolve) => { retryResolver = resolve; });
  globalThis.__retryResolver = retryResolver;

  try {
    const result = await client.callTool({ name: toolName, arguments: args });
    return result;
  } catch (error) {
    if (error.code === 402) {
      console.log("\n⏳ Waiting for payment retry...");
      const retryResult = await retryPromise;
      return retryResult;
    } else {
      throw error;
    }
  }
}
