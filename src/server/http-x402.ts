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
import { verify } from "x402/facilitator";
import { createConnectedClient } from "x402/types";
import { getActiveNetwork } from "./config/network.js";
import { TOOL_CONFIG } from "./config/tools.js";
import { Compiler } from "@remix-project/remix-solidity";

const HTTP_X402_PORT = process.env.HTTP_X402_PORT ? parseInt(process.env.HTTP_X402_PORT) : 8002;

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
 * Create x402 payment requirements
 */
function createPaymentRequirements(resource: string, amount: string) {
  const network = getActiveNetwork();
  const payToAddress = process.env.PAY_TO_ADDRESS;

  return {
    scheme: "exact",
    network: network.name,
    maxAmountRequired: amount,
    resource,
    mimeType: "application/json",
    payTo: payToAddress,
    maxTimeoutSeconds: 300,
    asset: network.usdcAddress,
    extra: {
      name: "USDC",
      version: "2",
    },
  };
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
 * Verify payment on-chain
 */
async function verifyPayment(payment: any, requirements: any): Promise<boolean> {
  try {
    const client = createConnectedClient(requirements.network);
    const verifyResponse = await verify(client, payment, requirements);

    if (verifyResponse.isValid) {
      console.log(`✅ Payment verified for ${requirements.resource}`);
      return true;
    } else {
      console.log(`❌ Payment invalid: ${verifyResponse.invalidReason}`);
      return false;
    }
  } catch (error: any) {
    console.error(`❌ Payment verification error:`, error.message);
    return false;
  }
}

/**
 * Handle /compile endpoint - Solidity compilation
 */
async function handleCompile(req: http.IncomingMessage, res: http.ServerResponse) {
  const resource = `${req.headers.host}/compile`;
  const amount = TOOL_CONFIG.payments.compileSolidity;
  const requirements = createPaymentRequirements(resource, amount);

  // Check for payment signature
  const paymentSignature = req.headers["payment-signature"] as string;

  if (!paymentSignature) {
    // No payment - return 402 with payment requirements
    res.writeHead(402, {
      "Content-Type": "application/json",
      "PAYMENT-REQUIRED": encodePaymentRequirements(requirements),
    });
    res.end(JSON.stringify({
      error: "Payment Required",
      message: "This endpoint requires payment",
      amount: `${parseFloat(amount) / 1_000_000} USDC`,
      network: getActiveNetwork().displayName,
    }));
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
          network: requirements.network,
          amount: requirements.maxAmountRequired,
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
  const resource = `${req.headers.host}/analyze`;
  const amount = TOOL_CONFIG.payments.analyzeWithSlither;
  const requirements = createPaymentRequirements(resource, amount);

  const paymentSignature = req.headers["payment-signature"] as string;

  if (!paymentSignature) {
    res.writeHead(402, {
      "Content-Type": "application/json",
      "PAYMENT-REQUIRED": encodePaymentRequirements(requirements),
    });
    res.end(JSON.stringify({
      error: "Payment Required",
      message: "This endpoint requires payment",
      amount: `${parseFloat(amount) / 1_000_000} USDC`,
      network: getActiveNetwork().displayName,
    }));
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
        network: requirements.network,
        amount: requirements.maxAmountRequired,
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
