#!/usr/bin/env node

/**
 * Unified Claude Client for Remix X402 MCP Server
 *
 * This script bridges both Claude Desktop and Claude Code CLI (stdio transport)
 * to the Remix X402 MCP server (HTTP transport) and handles x402 micropayments
 * automatically.
 *
 * Architecture:
 * Claude Desktop/Code (stdio) ←→ This Client ←→ Remix X402 Server (HTTP+x402)
 *
 * Works with:
 * - Claude Desktop (GUI application)
 * - Claude Code CLI (terminal interface)
 *
 * Required: EVM_PRIVATE_KEY environment variable with Base Sepolia wallet
 */

// ============================================================================
// Stdout Filtering - MUST be done BEFORE any imports
// ============================================================================
// Claude Desktop/Code expect only JSON-RPC messages on stdout.
// Redirect everything else to stderr to prevent parsing errors.

const originalStdoutWrite = process.stdout.write.bind(process.stdout);

process.stdout.write = function(chunk, encoding, callback) {
  const str = chunk.toString();
  // Only allow JSON-RPC messages to stdout
  if (str.trim().startsWith('{') && str.includes('jsonrpc')) {
    return originalStdoutWrite(chunk, encoding, callback);
  }
  // Everything else goes to stderr
  process.stderr.write(chunk, encoding, callback);
  return true;
};

// Redirect console.log as well
const originalLog = console.log;
console.log = function(...args) {
  const msg = args.join(' ');
  if (msg.startsWith('{') && msg.includes('jsonrpc')) {
    originalStdoutWrite(msg + '\n');
  } else {
    console.error(...args);
  }
};

// ============================================================================
// Imports and Configuration
// ============================================================================

import { createInterface } from 'readline';
import { createMCPClient } from './src/lib/index.js';

const SERVER_URL = process.env.MCP_SERVER_URL || 'https://mcp.api.remix.live/x402/mcp';

// Validate private key
if (!process.env.EVM_PRIVATE_KEY && !process.env.PRIVATE_KEY) {
  console.error(JSON.stringify({
    jsonrpc: '2.0',
    error: { code: -32600, message: 'EVM_PRIVATE_KEY or PRIVATE_KEY environment variable required' }
  }));
  process.exit(1);
}

// Normalize to PRIVATE_KEY for createMCPClient
process.env.PRIVATE_KEY = process.env.EVM_PRIVATE_KEY || process.env.PRIVATE_KEY;

// ============================================================================
// Main Client Logic
// ============================================================================

async function main() {
  try {
    // Create MCP client with x402 payment support
    const { client, transport } = createMCPClient(SERVER_URL, {
      name: 'claude-remix-x402-client',
      version: '1.0.0'
    });

    // Connect to the Remix X402 server
    await client.connect(transport);
    console.error('Connected to Remix X402 MCP Server');

    // Set up stdio interface to read from Claude Desktop/Code
    const rl = createInterface({
      input: process.stdin,
      terminal: false
    });

    // Handle incoming JSON-RPC messages from Claude
    rl.on('line', async (line) => {
      try {
        const message = JSON.parse(line);

        if (message.method === 'initialize') {
          // Return server capabilities
          console.log(JSON.stringify({
            jsonrpc: '2.0',
            id: message.id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: { tools: {} },
              serverInfo: {
                name: 'remix-x402-server',
                version: '1.0.0'
              }
            }
          }));
        } else if (message.method === 'tools/list') {
          // List available tools from server
          const tools = await client.listTools();
          console.log(JSON.stringify({
            jsonrpc: '2.0',
            id: message.id,
            result: tools
          }));
        } else if (message.method === 'tools/call') {
          // Execute tool (handles x402 payment automatically)
          const toolResult = await client.callTool(message.params);
          console.log(JSON.stringify({
            jsonrpc: '2.0',
            id: message.id,
            result: toolResult
          }));
        } else if (message.method === 'notifications/initialized') {
          // No response needed for notifications
        } else {
          // Unknown method
          console.error(JSON.stringify({
            jsonrpc: '2.0',
            id: message.id,
            error: { code: -32601, message: `Method not found: ${message.method}` }
          }));
        }
      } catch (e) {
        // Parse or execution error
        console.error(JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: `Error: ${e.message}` }
        }));
      }
    });

    rl.on('close', () => {
      process.exit(0);
    });

  } catch (error) {
    // Fatal initialization error
    console.error(JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32603, message: error.message }
    }));
    process.exit(1);
  }
}

main();
