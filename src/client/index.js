import { Client } from "@ampersend_ai/ampersend-sdk/mcp/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Treasurer } from "./treasurer.js";
import { USDCWallet } from "./usdc-wallet.js";
import { privateKeyToAccount } from "viem/accounts";
import dotenv from "dotenv";

dotenv.config();

/**
 * Creates and configures an MCP client with x402 payment support using AccountWallet
 * @param {string} serverUrl - The MCP server URL
 * @param {Object} clientInfo - Client information (name, version)
 * @returns {Object} Configured client and transport
 */
export function createMCPClient(serverUrl, clientInfo = { name: "MyMCPClient", version: "1.0.0" }) {
  const privateKey = process.env.PRIVATE_KEY || process.env.SAMPLE_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error("PRIVATE_KEY must be set in .env file");
  }

  // Create viem account from private key
  const account = privateKeyToAccount(privateKey);

  // Create custom USDC wallet with proper EIP-712 signatures
  const wallet = new USDCWallet(account);

  // Create treasurer
  const treasurer = new Treasurer(wallet);

  // Create Ampersend MCP Client with treasurer
  const client = new Client(
    clientInfo,
    {
      treasurer,
      mcpOptions: { capabilities: { tools: {} } }
    }
  );

  // Create transport
  const transport = new StreamableHTTPClientTransport(new URL(serverUrl));

  console.log(`💼 Wallet address: ${wallet.address}`);

  return { client, transport, treasurer, wallet };
}
