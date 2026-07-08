/**
 * HTTP REST x402 Server
 *
 * This server provides HTTP REST endpoints that implement the x402 protocol
 * with proper 402 Payment Required responses and payment verification.
 *
 * These endpoints wrap the MCP tools to make them compatible with
 * standard x402 HTTP clients and validators like agentic.market.
 */

import http from "http";
import { URL } from "url";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { getActiveNetwork } from "./config/network.js";
import { TOOL_CONFIG } from "./config/tools.js";
import { Compiler } from "@remix-project/remix-solidity";
import { generateJwt } from "@coinbase/cdp-sdk/auth";

const HTTP_X402_PORT = process.env.HTTP_X402_PORT ? parseInt(process.env.HTTP_X402_PORT) : 8002;

// Facilitator Configuration
// The facilitator settles payments on behalf of the server (facilitator pays gas)
//
// Option 1: x402.org facilitator (testnet only, no auth required)
//   - URL: https://x402.org/facilitator
//   - Networks: Base Sepolia, Solana Devnet
//   - Authentication: None
//   - Use for: Testing and development
//
// Option 2: CDP facilitator (testnet + mainnet, requires CDP API keys)
//   - URL: https://api.cdp.coinbase.com/platform/v2/x402
//   - Networks: All supported networks
//   - Authentication: CDP_API_KEY_ID and CDP_API_KEY_SECRET required
//   - Use for: Production or if you need more than testnet
//
// Lazy-load facilitator client to ensure env vars are loaded
let facilitatorClient: HTTPFacilitatorClient | null = null;
let USE_CDP_FACILITATOR = false;
let FACILITATOR_URL = "";

function getFacilitatorClient(): HTTPFacilitatorClient {
  if (facilitatorClient) {
    return facilitatorClient;
  }

  // Check for CDP credentials (loaded by dotenv in index.ts)
  USE_CDP_FACILITATOR = !!(process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET);
  FACILITATOR_URL = USE_CDP_FACILITATOR
    ? "https://api.cdp.coinbase.com/platform/v2/x402"
    : "https://x402.org/facilitator";

  console.log(`🔐 Facilitator: ${USE_CDP_FACILITATOR ? 'CDP' : 'x402.org'} - ${FACILITATOR_URL}`);

  // Create HTTPFacilitatorClient with CDP authentication if available
  // CDP requires JWT bearer tokens signed with Ed25519 for each request
  facilitatorClient = new HTTPFacilitatorClient({
    url: FACILITATOR_URL,
    ...(USE_CDP_FACILITATOR ? {
      createAuthHeaders: async () => {
        // Generate JWT bearer tokens for CDP authentication
        // Each operation needs a separate JWT with the correct request path
        const generateAuthHeader = async (requestPath: string) => {
          const jwt = await generateJwt({
            apiKeyId: process.env.CDP_API_KEY_ID!,
            apiKeySecret: process.env.CDP_API_KEY_SECRET!,
            requestMethod: 'POST',
            requestHost: 'api.cdp.coinbase.com',
            requestPath: requestPath,
          });
          return { 'Authorization': `Bearer ${jwt}` };
        };

        // Generate tokens for each operation
        const [verifyHeaders, settleHeaders, supportedHeaders] = await Promise.all([
          generateAuthHeader('/platform/v2/x402/verify'),
          generateAuthHeader('/platform/v2/x402/settle'),
          generateAuthHeader('/platform/v2/x402/supported'),
        ]);

        return {
          verify: verifyHeaders,
          settle: settleHeaders,
          supported: supportedHeaders,
        };
      }
    } : {})
  });

  return facilitatorClient;
}

/**
 * Validate that PAY_TO_ADDRESS is set and not zero address
 */
function validatePayToAddress(address: string | undefined): string {
  if (!address) {
    throw new Error("PAY_TO_ADDRESS environment variable is not set. Payment address is required.");
  }

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  if (address.toLowerCase() === ZERO_ADDRESS.toLowerCase()) {
    throw new Error("PAY_TO_ADDRESS cannot be the zero address. Payments would be lost forever.");
  }

  // Basic validation: check if it looks like an Ethereum address
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error(`PAY_TO_ADDRESS is not a valid Ethereum address: ${address}`);
  }

  return address;
}

/**
 * Parse JSON body from request
 */
async function parseBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk.toString()));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

/**
 * Create x402 v2 payment required response
 */
function createPaymentRequiredResponse(resourceUrl: string, description: string, amount: string, inputSchema: any, inputExample: any, outputExample: any) {
  const network = getActiveNetwork();
  const payToAddress = validatePayToAddress(process.env.PAY_TO_ADDRESS);

  return {
    x402Version: 2,
    resource: {
      url: resourceUrl,
      description: description,
      mimeType: "application/json",
    },
    accepts: [
      {
        asset: network.usdcAddress,
        amount: amount,
        network: `eip155:${network.chainId}`,
        payTo: payToAddress,
        scheme: "exact" as const,
        maxTimeoutSeconds: 300,
        extra: {
          // EIP-712 domain parameters for USDC (required for EIP-3009 signatures)
          name: "USD Coin",
          version: "2"
        }
      },
    ],
    extensions: {
      ...declareDiscoveryExtension({
        method: "POST",
        input: inputExample,
        inputSchema: inputSchema,
        bodyType: "json" as const,
        output: {
          example: outputExample,
        },
      } as any),
    },
  };
}

/**
 * Create v2 payment requirements for header
 */
function createPaymentRequirements(resource: string, amount: string, extensions?: any) {
  const network = getActiveNetwork();
  const payToAddress = validatePayToAddress(process.env.PAY_TO_ADDRESS);

  const requirements: any = {
    x402Version: 2,
    resource: {
      url: resource,
      mimeType: "application/json",
    },
    accepts: [
      {
        asset: network.usdcAddress,
        amount: amount,
        network: `eip155:${network.chainId}`,
        payTo: payToAddress,
        scheme: "exact" as const,
        maxTimeoutSeconds: 300,
        extra: {
          // EIP-712 domain parameters for USDC (required for EIP-3009 signatures)
          name: "USD Coin",
          version: "2"
        }
      },
    ],
  };

  // Include extensions if provided (for Bazaar discovery)
  if (extensions) {
    requirements.extensions = extensions;
  }

  return requirements;
}

/**
 * Encode payment requirements to base64 for PAYMENT-REQUIRED header
 */
function encodePaymentRequirements(requirements: any): string {
  return Buffer.from(JSON.stringify(requirements)).toString("base64");
}

/**
 * Decode payment signature from PAYMENT-SIGNATURE header
 */
function decodePaymentSignature(headerValue: string): any {
  try {
    return JSON.parse(Buffer.from(headerValue, "base64").toString("utf-8"));
  } catch (error) {
    throw new Error("Invalid payment signature format");
  }
}

/**
 * Settle and verify payment using CDP Facilitator
 *
 * CDP Facilitator Flow (Approach 2):
 * 1. Client signs EIP-3009 authorization (off-chain signature)
 * 2. Client sends signed authorization to server
 * 3. Server calls CDP Facilitator to settle payment
 *    - Facilitator pays gas (not client, not server)
 *    - Facilitator executes USDC transfer on-chain
 * 4. Server verifies settlement succeeded via facilitator
 * 5. Server provides the service
 *
 * Requirements:
 * - CDP_API_KEY_ID and CDP_API_KEY_SECRET environment variables
 * - Obtained from https://portal.cdp.coinbase.com/
 *
 * Benefits:
 * - Server doesn't pay gas
 * - Client doesn't pay gas
 * - CDP Facilitator sponsors the gas
 */
async function verifyPayment(payment: any, v2Requirements: any): Promise<boolean> {
  try {
    const from = payment.payload?.authorization?.from;
    const to = payment.payload?.authorization?.to;
    const amount = payment.payload?.authorization?.value;
    const network = payment.accepted?.network || payment.network;

    console.log(`💰 Payment: ${amount} units from ${from?.slice(0, 10)}... to ${to?.slice(0, 10)}... on ${network}`);

    // Normalize payment object for facilitator
    // The facilitator expects scheme and network at top level, plus accepted field
    // Remove extensions from payment payload as CDP facilitator doesn't recognize it
    const normalizedPayment = {
      x402Version: payment.x402Version,
      payload: payment.payload,
      scheme: payment.accepted?.scheme || 'exact',
      network: payment.accepted?.network,
      resource: payment.resource,
      // Ensure accepted field is present (required by CDP facilitator for v2)
      accepted: payment.accepted || {
        asset: v2Requirements.accepts[0]?.asset,
        amount: v2Requirements.accepts[0]?.amount,
        network: v2Requirements.accepts[0]?.network,
        payTo: v2Requirements.accepts[0]?.payTo,
        scheme: v2Requirements.accepts[0]?.scheme,
        maxTimeoutSeconds: v2Requirements.accepts[0]?.maxTimeoutSeconds,
        extra: v2Requirements.accepts[0]?.extra,
      },
    };

    // Settle payment via facilitator
    console.log(`⛓️  Settling payment via facilitator...`);
    console.log(`   Payment payload:`, JSON.stringify(normalizedPayment, null, 2));
    console.log(`   Requirements:`, JSON.stringify(v2Requirements, null, 2));

    // For CDP facilitator, try using the full v2Requirements object
    // This includes x402Version which CDP might need
    const paymentRequirements = v2Requirements;
    console.log(`   Using full requirements (with x402Version):`, JSON.stringify(paymentRequirements, null, 2));

    // Log the exact data being sent to CDP facilitator
    console.log('\n🔍 CDP Facilitator Request Data:');
    console.log('Payment payload authorization:', JSON.stringify(normalizedPayment.payload?.authorization, null, 2));
    console.log('Payment payload signature:', normalizedPayment.payload?.signature);
    console.log('Payment scheme:', normalizedPayment.scheme);
    console.log('Payment network:', normalizedPayment.network);

    const client = getFacilitatorClient();
    const settleResponse = await client.settle(normalizedPayment, paymentRequirements);

    if (!settleResponse.success) {
      console.error(`❌ Settlement failed: ${settleResponse.errorReason || 'unknown'}`);
      if (settleResponse.errorMessage) {
        console.error(`   ${settleResponse.errorMessage}`);
      }
      return false;
    }

    console.log(`✅ Payment settled - TX: ${settleResponse.transaction || 'N/A'}`);

    // Verify the settlement
    const verifyResponse = await client.verify(normalizedPayment, paymentRequirements);

    if (verifyResponse.isValid) {
      console.log(`✅ Payment verified on-chain`);
      return true;
    } else {
      console.error(`❌ Verification failed: ${verifyResponse.invalidReason || 'unknown'}`);
      return false;
    }
  } catch (error: any) {
    console.error(`❌ Payment error: ${error.message}`);
    if (error.response) {
      console.error(`   Response status: ${error.response.status}`);
      console.error(`   Response data:`, JSON.stringify(error.response.data, null, 2));
    }
    if (error.cause) {
      console.error(`   Cause:`, error.cause);
    }
    console.error(`   Full error:`, error);
    return false;
  }
}

/**
 * Handle /compile endpoint - Solidity compilation
 */
async function handleCompile(req: http.IncomingMessage, res: http.ServerResponse) {
  const resource = `https://${req.headers.host}/compile`;
  const amount = TOOL_CONFIG.payments.compileSolidity;
  const requirements = createPaymentRequirements(resource, amount);

  // Check for payment signature
  const paymentSignature = req.headers["payment-signature"] as string;

  if (!paymentSignature) {
    // No payment - return 402 with v2 payment requirements
    const inputSchema = {
      type: "object",
      properties: {
        sources: {
          type: "object",
          description: "Map of filename to source code",
          additionalProperties: {
            type: "object",
            properties: {
              content: { type: "string" }
            },
            required: ["content"]
          }
        },
        version: { type: "string", description: "Solidity compiler version" },
        settings: { type: "object", description: "Compiler settings" }
      },
      required: ["sources"]
    };

    const inputExample = {
      sources: {
        "MyToken.sol": {
          content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MyToken {
    string public name = "MyToken";
}`
        }
      },
      version: "v0.8.35+commit.47b9dedd"
    };

    const outputExample = {
      success: true,
      contracts: {
        "MyToken.sol": {
          MyToken: {
            abi: [],
            evm: { bytecode: { object: "0x608060405..." } }
          }
        }
      },
      version: "v0.8.35+commit.47b9dedd"
    };

    const v2Response = createPaymentRequiredResponse(
      resource,
      "Compile Solidity smart contracts using the Remix compiler",
      amount,
      inputSchema,
      inputExample,
      outputExample
    );

    // Include extensions in the header as well
    const requirementsWithExtensions = createPaymentRequirements(resource, amount, v2Response.extensions);

    res.writeHead(402, {
      "Content-Type": "application/json",
      "PAYMENT-REQUIRED": encodePaymentRequirements(requirementsWithExtensions),
    });
    res.end(JSON.stringify(v2Response, null, 2));
    return;
  }

  // Verify payment
  try {
    const payment = decodePaymentSignature(paymentSignature);
    const isValid = await verifyPayment(payment, requirements);

    if (!isValid) {
      res.writeHead(402, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid or unconfirmed payment" }));
      return;
    }

    // Payment verified - execute compilation
    const body = await parseBody(req);
    const { sources, version, settings } = body;

    if (!sources) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing required field: sources" }));
      return;
    }

    // Compile using Remix compiler
    const compilerVersion = version || TOOL_CONFIG.compiler.version;
    const compilerSettings = settings || TOOL_CONFIG.compiler.defaultSettings;

    console.log(`🔨 Compiling with ${compilerVersion}...`);

    const compiler = new Compiler();

    // Use event-based compilation (Remix Compiler API)
    await new Promise<void>((resolve, reject) => {
      compiler.event.register("compilationFinished", (success: boolean, data: any) => {
        const paymentResponseHeader = Buffer.from(JSON.stringify({
          status: "settled",
          network: requirements.accepts[0]!.network,
          amount: requirements.accepts[0]!.amount,
        })).toString("base64");

        if (success) {
          res.writeHead(200, {
            "Content-Type": "application/json",
            "PAYMENT-RESPONSE": paymentResponseHeader,
          });
          res.end(JSON.stringify({
            success: true,
            contracts: data.contracts,
            sources: data.sources,
            errors: data.errors?.filter((e: any) => e.severity === "warning") || [],
            settings: compilerSettings,
            version: compilerVersion,
          }));
          resolve();
        } else {
          res.writeHead(200, {
            "Content-Type": "application/json",
            "PAYMENT-RESPONSE": paymentResponseHeader,
          });
          res.end(JSON.stringify({
            success: false,
            errors: data.errors || [],
            version: compilerVersion,
          }));
          resolve();
        }
      });

      compiler.event.register("compilerLoaded", () => {
        compiler.compile(sources, "");
      });

      compiler.loadRemoteVersion(compilerVersion);
    });

  } catch (error: any) {
    console.error("Compilation error:", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      error: "Compilation failed",
      details: error.message,
    }));
  }
}

/**
 * Handle /analyze endpoint - Slither analysis
 */
async function handleAnalyze(req: http.IncomingMessage, res: http.ServerResponse) {
  const resource = `https://${req.headers.host}/analyze`;
  const amount = TOOL_CONFIG.payments.analyzeWithSlither;
  const requirements = createPaymentRequirements(resource, amount);

  const paymentSignature = req.headers["payment-signature"] as string;

  if (!paymentSignature) {
    // No payment - return 402 with v2 payment requirements
    const inputSchema = {
      type: "object",
      properties: {
        sources: {
          type: "object",
          description: "Map of filename to source code",
          additionalProperties: {
            type: "object",
            properties: {
              content: { type: "string" }
            },
            required: ["content"]
          }
        },
        version: { type: "string", description: "Solidity compiler version" },
        detectors: { type: "array", items: { type: "string" }, description: "Specific Slither detectors" },
        excludeLow: { type: "boolean", description: "Exclude low severity findings" },
        excludeInformational: { type: "boolean", description: "Exclude informational findings" }
      },
      required: ["sources"]
    };

    const inputExample = {
      sources: {
        "Contract.sol": {
          content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Example {
    uint256 public value;

    function setValue(uint256 _value) public {
        value = _value;
    }
}`
        }
      },
      version: "v0.8.35+commit.47b9dedd"
    };

    const outputExample = {
      success: true,
      summary: { totalFindings: 0, high: 0, medium: 0, low: 0 },
      findings: []
    };

    const v2Response = createPaymentRequiredResponse(
      resource,
      "Run static security analysis on Solidity contracts using Slither",
      amount,
      inputSchema,
      inputExample,
      outputExample
    );

    // Include extensions in the header as well
    const requirementsWithExtensions = createPaymentRequirements(resource, amount, v2Response.extensions);

    res.writeHead(402, {
      "Content-Type": "application/json",
      "PAYMENT-REQUIRED": encodePaymentRequirements(requirementsWithExtensions),
    });
    res.end(JSON.stringify(v2Response, null, 2));
    return;
  }

  try {
    const payment = decodePaymentSignature(paymentSignature);
    const isValid = await verifyPayment(payment, requirements);

    if (!isValid) {
      res.writeHead(402, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid or unconfirmed payment" }));
      return;
    }

    const body = await parseBody(req);
    const { sources, version, detectors, excludeLow, excludeInformational } = body;

    if (!sources) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing required field: sources" }));
      return;
    }

    // Call Remix Slither API
    console.log(`🔍 Running Slither analysis...`);

    const response = await fetch("https://remix.ethereum.org/api/slither/analyse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sources,
        compilerVersion: version || "0.8.35",
        slitherOptions: {
          detectors: detectors || [],
          excludeLow: excludeLow || false,
          excludeInformational: excludeInformational || false,
        },
      }),
    });

    const analysisData = await response.json();

    res.writeHead(200, {
      "Content-Type": "application/json",
      "PAYMENT-RESPONSE": Buffer.from(JSON.stringify({
        status: "settled",
        network: requirements.accepts[0]!.network,
        amount: requirements.accepts[0]!.amount,
      })).toString("base64"),
    });

    res.end(JSON.stringify({
      success: true,
      ...analysisData,
    }));

  } catch (error: any) {
    console.error("Analysis error:", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      error: "Analysis failed",
      details: error.message,
    }));
  }
}

/**
 * Handle /info endpoint - Service information
 */
function handleInfo(_req: http.IncomingMessage, res: http.ServerResponse) {
  const network = getActiveNetwork();
  const payToAddress = process.env.PAY_TO_ADDRESS;

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    name: "Remix x402 HTTP Server",
    version: "1.0.0",
    protocol: "x402",
    endpoints: {
      compile: {
        path: "/compile",
        method: "POST",
        price: `${parseFloat(TOOL_CONFIG.payments.compileSolidity) / 1_000_000} USDC`,
        description: "Compile Solidity contracts",
      },
      analyze: {
        path: "/analyze",
        method: "POST",
        price: `${parseFloat(TOOL_CONFIG.payments.analyzeWithSlither) / 1_000_000} USDC`,
        description: "Security analysis with Slither",
      },
    },
    network: network.displayName,
    chainId: network.chainId,
    payTo: payToAddress,
  }));
}

/**
 * Create and start the HTTP x402 server
 */
export function startHttpX402Server() {
  const PAY_TO_ADDRESS = process.env.PAY_TO_ADDRESS;

  if (!PAY_TO_ADDRESS) {
    console.warn("\n⚠️  PAY_TO_ADDRESS not set. HTTP x402 server will not start.");
    console.warn("   Set PAY_TO_ADDRESS environment variable to enable HTTP REST endpoints.\n");
    return null;
  }

  const server = http.createServer(async (req, res) => {
    // Enable CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Payment-Signature");
    res.setHeader("Access-Control-Expose-Headers", "Payment-Required, Payment-Response");

    // Handle preflight
    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    try {
      // Route requests
      if (url.pathname === "/compile" && req.method === "POST") {
        await handleCompile(req, res);
      } else if (url.pathname === "/analyze" && req.method === "POST") {
        await handleAnalyze(req, res);
      } else if (url.pathname === "/" || url.pathname === "/info") {
        handleInfo(req, res);
      } else if (url.pathname === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "healthy" }));
      } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          error: "Not found",
          availableEndpoints: ["/", "/compile", "/analyze", "/health"],
        }));
      }
    } catch (error: any) {
      console.error("Request error:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  });

  server.listen(HTTP_X402_PORT, () => {
    console.log(`\n⚡ HTTP x402 Server running on http://localhost:${HTTP_X402_PORT}`);
    console.log(`   POST /compile - Compile Solidity (${parseFloat(TOOL_CONFIG.payments.compileSolidity) / 1_000_000} USDC)`);
    console.log(`   POST /analyze - Slither analysis (${parseFloat(TOOL_CONFIG.payments.analyzeWithSlither) / 1_000_000} USDC)`);
    console.log(`   GET  /info - Service information`);
    console.log(`   GET  /health - Health check`);
    console.log(`\n📡 These endpoints are x402-compatible and can be validated on agentic.market`);
  });

  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      console.error(`❌ Port ${HTTP_X402_PORT} is already in use. HTTP x402 server not started.`);
    } else {
      console.error("❌ HTTP x402 server error:", error);
    }
  });

  return server;
}
