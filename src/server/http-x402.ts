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
import { TOOL_CONFIG, getAuditChecklistPrice, getDoAuditPrice } from "./config/tools.js";
import { SERVICE_METADATA, COMPILE_SOLIDITY_METADATA, ANALYZE_SLITHER_METADATA, GET_AUDIT_CHECKLIST_METADATA, DO_AUDIT_METADATA } from "./config/bazaar.js";
import { Compiler } from "@remix-project/remix-solidity";
import { generateJwt } from "@coinbase/cdp-sdk/auth";
import {
  loadAuditChecklist,
  flattenCategoriesForPrompt,
  generateCategoryListPrompt,
  stripToSkeleton,
  formatAuditReportMarkdown,
  type AuditMatch
} from "./utils/audit-checklist.js";
import {
  testOpenRouterAvailability,
  callOpenRouterJSON,
  mapModelName
} from "./utils/openrouter.js";
import { httpLogger, paymentLogger, logError, logRequestReceived, logPaymentVerification, logResponseSent } from "./utils/logger.js";

const HTTP_X402_PORT = process.env.HTTP_X402_PORT ? parseInt(process.env.HTTP_X402_PORT) : 8002;

/**
 * Create a detailed error response for failures after payment settlement
 * This ensures users get comprehensive error information when they've already paid
 */
function createPostPaymentErrorResponse(
  error: any,
  endpoint: string,
  additionalContext?: Record<string, any>
): {
  response: any;
  requestId: string;
} {
  const requestId = `${endpoint.replace('/', '')}-${Date.now()}`;

  const errorResponse = {
    success: false,
    error: "Service execution failed",
    message: error.message || `An unexpected error occurred during ${endpoint} execution`,
    errorType: error.name || "Error",
    paymentStatus: "settled",
    requestId,
    timestamp: new Date().toISOString(),
    ...(additionalContext || {}),
    ...(process.env.NODE_ENV !== 'production' && {
      stack: error.stack,
      details: error.toString()
    })
  };

  return { response: errorResponse, requestId };
}

// Facilitator Configuration
// The facilitator settles payments on behalf of the server (facilitator pays gas)
//
// CDP facilitator (testnet + mainnet, requires CDP API keys)
//   - URL: https://api.cdp.coinbase.com/platform/v2/x402
//   - Networks: All supported networks
//   - Authentication: CDP_API_KEY_ID and CDP_API_KEY_SECRET required
//
// Lazy-load facilitator client to ensure env vars are loaded
let facilitatorClient: HTTPFacilitatorClient | null = null;

function getFacilitatorClient(): HTTPFacilitatorClient {
  if (facilitatorClient) {
    return facilitatorClient;
  }

  // Check for required CDP credentials
  if (!process.env.CDP_API_KEY_ID || !process.env.CDP_API_KEY_SECRET) {
    throw new Error(
      "CDP_API_KEY_ID and CDP_API_KEY_SECRET environment variables are required. " +
      "Get your credentials at https://portal.cdp.coinbase.com/"
    );
  }

  const FACILITATOR_URL = "https://api.cdp.coinbase.com/platform/v2/x402";

  paymentLogger.info({ facilitatorUrl: FACILITATOR_URL }, "Facilitator: CDP");

  // Create HTTPFacilitatorClient with CDP authentication
  // CDP requires JWT bearer tokens signed with Ed25519 for each request
  facilitatorClient = new HTTPFacilitatorClient({
    url: FACILITATOR_URL,
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
function createPaymentRequiredResponse(resourceUrl: string, description: string, amount: string, inputSchema: any, inputExample: any, outputExample: any, endpointTags?: string[]) {
  const network = getActiveNetwork();
  const payToAddress = validatePayToAddress(process.env.PAY_TO_ADDRESS);

  return {
    x402Version: 2,
    resource: {
      url: resourceUrl,
      description: description,
      mimeType: "application/json",
    },
    // Service metadata at top level for CDP Bazaar indexing
    description: SERVICE_METADATA.description,
    serviceName: SERVICE_METADATA.name,
    tags: endpointTags || SERVICE_METADATA.tags,
    iconUrl: SERVICE_METADATA.logo,
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
          // IMPORTANT: Must match exactly what the USDC contract returns
          // Base Mainnet uses "USD Coin", Base Sepolia uses "USDC"
          name: network.chainId === 8453 ? "USD Coin" : "USDC",
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
function createPaymentRequirements(resource: string, amount: string, extensions?: any, description?: string, endpointTags?: string[]) {
  const network = getActiveNetwork();
  const payToAddress = validatePayToAddress(process.env.PAY_TO_ADDRESS);

  const requirements: any = {
    x402Version: 2,
    resource: {
      url: resource,
      mimeType: "application/json",
      ...(description && { description }),
    },
    // Service metadata at top level for CDP Bazaar indexing
    description: SERVICE_METADATA.description,
    serviceName: SERVICE_METADATA.name,
    tags: endpointTags || SERVICE_METADATA.tags,
    iconUrl: SERVICE_METADATA.logo,
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
          // IMPORTANT: Must match exactly what the USDC contract returns
          // Base Mainnet uses "USD Coin", Base Sepolia uses "USDC"
          name: network.chainId === 8453 ? "USD Coin" : "USDC",
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
 * Verify and settle payment using CDP Facilitator
 * - Verify: Validates the EIP-3009 authorization signature
 * - Settle: Executes the USDC transfer on-chain (CDP pays gas)
 * @param resourceUrl - The resource URL for Bazaar indexing (required for CDP catalog)
 */
async function verifyPayment(payment: any, v2Requirements: any, resourceUrl: string): Promise<boolean> {
  try {
    const from = payment.payload?.authorization?.from;
    const to = payment.payload?.authorization?.to;
    const amount = payment.payload?.authorization?.value;
    const network = payment.accepted?.network || payment.network;

    paymentLogger.info({
      amount,
      from: from?.slice(0, 10) + '...',
      to: to?.slice(0, 10) + '...',
      network
    }, "Payment received");

    // Normalize payment object for facilitator
    // IMPORTANT: resource field is required for CDP Bazaar indexing
    // The resource must be a ResourceInfo object with url, description, etc.
    const resourceInfo = payment.resource && typeof payment.resource === 'object' && 'url' in payment.resource
      ? payment.resource
      : { url: resourceUrl, description: v2Requirements.resource?.description, mimeType: "application/json" };

    // Build normalized payment payload for CDP
    // CRITICAL: Must include extensions field with Bazaar metadata for indexing!
    const normalizedPayment = {
      x402Version: payment.x402Version,
      payload: payment.payload,
      resource: resourceInfo, // Must be a ResourceInfo object for Bazaar indexing
      accepted: payment.accepted || {
        asset: v2Requirements.accepts[0]?.asset,
        amount: v2Requirements.accepts[0]?.amount,
        network: v2Requirements.accepts[0]?.network,
        payTo: v2Requirements.accepts[0]?.payTo,
        scheme: v2Requirements.accepts[0]?.scheme,
        maxTimeoutSeconds: v2Requirements.accepts[0]?.maxTimeoutSeconds,
        extra: v2Requirements.accepts[0]?.extra,
      },
      // Include service-level metadata for CDP Bazaar cataloging
      description: v2Requirements.description,
      serviceName: v2Requirements.serviceName,
      tags: v2Requirements.tags,
      iconUrl: v2Requirements.iconUrl,
      // Include Bazaar extensions from the payment or from v2Requirements
      extensions: payment.extensions || v2Requirements.extensions,
    };


    // Build PaymentRequirements object with all required fields
    const acceptedRequirements = payment.accepted || v2Requirements.accepts[0];
    const paymentRequirements: any = {
      scheme: acceptedRequirements.scheme || 'exact',
      network: acceptedRequirements.network,
      asset: acceptedRequirements.asset,
      amount: acceptedRequirements.amount,
      payTo: acceptedRequirements.payTo,
      maxTimeoutSeconds: acceptedRequirements.maxTimeoutSeconds || 300,
      extra: acceptedRequirements.extra || {},
    };

    // CRITICAL: Validate payment amount BEFORE settling
    // Prevent payment loss if amount doesn't match expected value
    const paidAmount = payment.payload?.authorization?.value?.toString() || "0";
    const expectedAmount = acceptedRequirements.amount?.toString() || "0";

    if (paidAmount !== expectedAmount) {
      paymentLogger.error({
        expectedAmount,
        paidAmount,
        stage: 'pre_settlement_amount_mismatch'
      }, 'Payment amount does not match requirements - rejecting BEFORE settlement');
      return false;
    }

    const client = getFacilitatorClient();

    // Step 1: Verify payment authorization
    paymentLogger.info("Verifying payment...");
    const verifyResponse = await client.verify(normalizedPayment, paymentRequirements);

    if (!verifyResponse.isValid) {
      paymentLogger.error({
        invalidReason: verifyResponse.invalidReason || 'unknown'
      }, "Verification failed");
      return false;
    }

    paymentLogger.info("Payment verified successfully");

    // Step 2: Settle the verified payment
    paymentLogger.info("Settling payment...");
    const settleResponse = await client.settle(normalizedPayment, paymentRequirements);

    if (!settleResponse.success) {
      paymentLogger.error({
        errorReason: settleResponse.errorReason || 'unknown',
        errorMessage: settleResponse.errorMessage
      }, "Settlement failed");
      return false;
    }

    paymentLogger.info({
      transaction: settleResponse.transaction || 'N/A'
    }, "Payment settled");
    return true;
  } catch (error: any) {
    logError(paymentLogger, error, {
      responseStatus: error.response?.status,
      responseData: error.response?.data
    });
    return false;
  }
}

/**
 * Handle /compile endpoint - Solidity compilation
 */
async function handleCompile(req: http.IncomingMessage, res: http.ServerResponse) {
  const startTime = Date.now();
  const method = req.method || 'POST';
  const path = '/compile';

  // Log request received
  const paymentSignature = req.headers["payment-signature"] as string;
  logRequestReceived(method, path, !!paymentSignature);

  // CRITICAL: Must use SERVER_BASE_URL for correct resource URLs in production
  // Without this, internal hostnames leak into 402 responses and payment payloads
  if (!process.env.SERVER_BASE_URL) {
    throw new Error("SERVER_BASE_URL environment variable is required");
  }
  const resource = `${process.env.SERVER_BASE_URL}/compile`;
  const amount = TOOL_CONFIG.payments.compileSolidity;
  const description = "Compile Solidity contracts with the Remix compiler, supporting multiple files, custom versions, and optimization settings";

  // Define schemas and examples once for reuse
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

  // Create v2Response and requirements with extensions
  const endpointTags = COMPILE_SOLIDITY_METADATA.tags;
  const v2Response = createPaymentRequiredResponse(
    resource,
    description,
    amount,
    inputSchema,
    inputExample,
    outputExample,
    endpointTags
  );

  const requirementsWithExtensions = createPaymentRequirements(resource, amount, v2Response.extensions, description, endpointTags);

  if (!paymentSignature) {
    // No payment - return 402 with v2 payment requirements
    httpLogger.info({ path, stage: 'payment_required' }, 'No payment provided, returning 402');
    res.writeHead(402, {
      "Content-Type": "application/json",
      "PAYMENT-REQUIRED": encodePaymentRequirements(requirementsWithExtensions),
    });
    res.end(JSON.stringify(v2Response, null, 2));
    logResponseSent(method, path, 402, Date.now() - startTime, false);
    return;
  }

  // Verify payment
  try {
    const payment = decodePaymentSignature(paymentSignature);
    const isValid = await verifyPayment(payment, requirementsWithExtensions, resource);

    if (!isValid) {
      logPaymentVerification(false, 'Invalid or unconfirmed payment');
      res.writeHead(402, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid or unconfirmed payment" }));
      logResponseSent(method, path, 402, Date.now() - startTime, false);
      return;
    }

    logPaymentVerification(true);

    // Payment verified - execute compilation
    const body = await parseBody(req);
    const { sources, version, settings } = body;

    if (!sources) {
      const errorResponse = {
        success: false,
        error: "Missing required field: sources",
        message: "The 'sources' field is required in the request body. It should be an object mapping file names to source code.",
        paymentStatus: "settled",
        requestId: `compile-${Date.now()}`,
        timestamp: new Date().toISOString()
      };

      httpLogger.error({ path, error: errorResponse, stage: 'post_payment_failure' }, 'Request failed after payment settled');

      res.writeHead(400, {
        "Content-Type": "application/json",
        "PAYMENT-RESPONSE": Buffer.from(JSON.stringify({
          status: "settled",
          network: requirementsWithExtensions.accepts[0]!.network,
          amount: requirementsWithExtensions.accepts[0]!.amount,
        })).toString("base64")
      });
      res.end(JSON.stringify(errorResponse));
      logResponseSent(method, path, 400, Date.now() - startTime, false);
      return;
    }

    // Compile using Remix compiler
    const compilerVersion = version || TOOL_CONFIG.compiler.version;
    const compilerSettings = settings || TOOL_CONFIG.compiler.defaultSettings;

    httpLogger.info({ version: compilerVersion }, "Compiling Solidity contracts");

    const compiler = new Compiler();

    // Use event-based compilation (Remix Compiler API)
    await new Promise<void>((resolve) => {
      compiler.event.register("compilationFinished", (success: boolean, data: any) => {
        const paymentResponseHeader = Buffer.from(JSON.stringify({
          status: "settled",
          network: requirementsWithExtensions.accepts[0]!.network,
          amount: requirementsWithExtensions.accepts[0]!.amount,
        })).toString("base64");

        if (success) {
          httpLogger.info({ path, stage: 'compilation_success' }, 'Compilation completed successfully');
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
          logResponseSent(method, path, 200, Date.now() - startTime, true);
          resolve();
        } else {
          httpLogger.error({ path, stage: 'compilation_failed', errors: data.errors || [] }, 'Compilation failed');
          res.writeHead(200, {
            "Content-Type": "application/json",
            "PAYMENT-RESPONSE": paymentResponseHeader,
          });
          res.end(JSON.stringify({
            success: false,
            errors: data.errors || [],
            version: compilerVersion,
          }));
          logResponseSent(method, path, 200, Date.now() - startTime, false);
          resolve();
        }
      });

      compiler.event.register("compilerLoaded", () => {
        compiler.compile(sources, "");
      });

      compiler.loadRemoteVersion(compilerVersion);
    });

  } catch (error: any) {
    // Payment was settled, but service failed - provide detailed error info
    const { response: errorResponse, requestId } = createPostPaymentErrorResponse(error, '/compile');

    logError(httpLogger, error, {
      endpoint: '/compile',
      requestId,
      stage: 'post_payment_failure',
      paymentSettled: true
    });

    res.writeHead(500, {
      "Content-Type": "application/json",
      "PAYMENT-RESPONSE": Buffer.from(JSON.stringify({
        status: "settled",
        network: requirementsWithExtensions.accepts[0]!.network,
        amount: requirementsWithExtensions.accepts[0]!.amount,
      })).toString("base64")
    });
    res.end(JSON.stringify(errorResponse));
    logResponseSent(method, path, 500, Date.now() - startTime, false);
  }
}

/**
 * Handle /analyze endpoint - Slither analysis
 */
async function handleAnalyze(req: http.IncomingMessage, res: http.ServerResponse) {
  // CRITICAL: Must use SERVER_BASE_URL for correct resource URLs in production
  // Without this, internal hostnames leak into 402 responses and payment payloads
  if (!process.env.SERVER_BASE_URL) {
    throw new Error("SERVER_BASE_URL environment variable is required");
  }
  const resource = `${process.env.SERVER_BASE_URL}/analyze`;
  const amount = TOOL_CONFIG.payments.analyzeWithSlither;
  const description = "Security analysis powered by Slither to detect vulnerabilities, reentrancy issues, and smart contract code quality problems";

  // Define schemas and examples once for reuse
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

  // Create v2Response and requirements with extensions
  const endpointTags = ANALYZE_SLITHER_METADATA.tags;
  const v2Response = createPaymentRequiredResponse(
    resource,
    description,
    amount,
    inputSchema,
    inputExample,
    outputExample,
    endpointTags
  );

  const requirementsWithExtensions = createPaymentRequirements(resource, amount, v2Response.extensions, description, endpointTags);

  const paymentSignature = req.headers["payment-signature"] as string;

  if (!paymentSignature) {
    // No payment - return 402 with v2 payment requirements
    res.writeHead(402, {
      "Content-Type": "application/json",
      "PAYMENT-REQUIRED": encodePaymentRequirements(requirementsWithExtensions),
    });
    res.end(JSON.stringify(v2Response, null, 2));
    return;
  }

  try {
    const payment = decodePaymentSignature(paymentSignature);
    const isValid = await verifyPayment(payment, requirementsWithExtensions, resource);

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
    httpLogger.info({ version: version || TOOL_CONFIG.slither.defaultVersion }, "Running Slither analysis");

    const response = await fetch(TOOL_CONFIG.slither.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sources,
        version: version || TOOL_CONFIG.slither.defaultVersion,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Slither API error (${response.status}): ${errorText.substring(0, 200)}`);
    }

    const slitherResult = await response.json();

    // Parse the Remix API response (same logic as MCP tool)
    let analysisResult;

    if (slitherResult && slitherResult.success && slitherResult.analysis) {
      // The analysis field is a JSON string, parse it first
      const analysisText = slitherResult.analysis as string;
      let analysisData;
      try {
        analysisData = JSON.parse(analysisText);
      } catch (parseError: any) {
        throw new Error(`Failed to parse analysis result: ${parseError.message}`);
      }

      const findings: any[] = [];

      // Check if we have JSON-based results (new format)
      if (analysisData.results && analysisData.results.detectors && Array.isArray(analysisData.results.detectors)) {
        // Extract findings from the JSON detectors array
        for (const detector of analysisData.results.detectors) {
          findings.push({
            check: detector.check,
            impact: detector.impact,
            confidence: detector.confidence,
            description: detector.description || detector.markdown,
          });
        }
      }

      // Apply client-side filters if requested
      let filteredFindings = findings;
      if (excludeInformational) {
        filteredFindings = filteredFindings.filter((f: any) => f.impact !== 'Informational');
      }
      if (excludeLow) {
        filteredFindings = filteredFindings.filter((f: any) => f.impact !== 'Low');
      }
      if (detectors && detectors.length > 0) {
        filteredFindings = filteredFindings.filter((f: any) =>
          detectors.includes(f.check)
        );
      }

      const summary = {
        totalFindings: filteredFindings.length,
        high: filteredFindings.filter((f: any) => f.impact === 'High').length,
        medium: filteredFindings.filter((f: any) => f.impact === 'Medium').length,
        low: filteredFindings.filter((f: any) => f.impact === 'Low').length,
        informational: filteredFindings.filter((f: any) => f.impact === 'Informational').length,
      };

      analysisResult = {
        success: true,
        summary,
        findings: filteredFindings,
      };
    } else if (slitherResult && !slitherResult.success) {
      httpLogger.error({
        error: slitherResult.error || slitherResult.message
      }, "Slither analysis failed");
      analysisResult = {
        success: false,
        error: "Slither analysis failed",
      };
    } else {
      analysisResult = {
        success: false,
        error: "Invalid response format from Remix API",
      };
    }

    res.writeHead(200, {
      "Content-Type": "application/json",
      "PAYMENT-RESPONSE": Buffer.from(JSON.stringify({
        status: "settled",
        network: requirementsWithExtensions.accepts[0]!.network,
        amount: requirementsWithExtensions.accepts[0]!.amount,
      })).toString("base64"),
    });

    res.end(JSON.stringify(analysisResult));

  } catch (error: any) {
    // Payment was settled, but service failed - provide detailed error info
    const { response: errorResponse, requestId } = createPostPaymentErrorResponse(error, '/analyze');

    logError(httpLogger, error, {
      endpoint: '/analyze',
      requestId,
      stage: 'post_payment_failure',
      paymentSettled: true
    });

    res.writeHead(500, {
      "Content-Type": "application/json",
      "PAYMENT-RESPONSE": Buffer.from(JSON.stringify({
        status: "settled",
        network: requirementsWithExtensions.accepts[0]!.network,
        amount: requirementsWithExtensions.accepts[0]!.amount,
      })).toString("base64")
    });
    res.end(JSON.stringify(errorResponse));
  }
}

/**
 * Handle /get_audit_checklist endpoint - OpenRouter AI prompts for smart contract analysis
 */
async function handleGetAuditChecklist(req: http.IncomingMessage, res: http.ServerResponse) {
  // Prevent duplicate handling if response already sent
  if (res.writableEnded) {
    httpLogger.warn({ endpoint: '/get_audit_checklist' }, "Attempted to handle request but response already sent");
    return;
  }

  // CRITICAL: Must use SERVER_BASE_URL for correct resource URLs in production
  if (!process.env.SERVER_BASE_URL) {
    throw new Error("SERVER_BASE_URL environment variable is required");
  }
  const resource = `${process.env.SERVER_BASE_URL}/get_audit_checklist`;
  // Use metadata description which includes pricing info
  const description = GET_AUDIT_CHECKLIST_METADATA.description;

  // Parse request body to get the model parameter
  // But delay validation until after payment check (x402 compliance)
  const body = await parseBody(req);
  const { model: requestedModel } = body;

  // For x402 compliance: Check payment BEFORE validating request parameters
  // We'll use the model if provided, or default to DeepSeek for the 402 response
  const paymentSignature = req.headers["payment-signature"] as string;

  // If no payment, use provided model for pricing (or default to DeepSeek)
  // Model validation will happen after payment verification
  let modelForPricing: "DeepSeek" | "Sonnet" | "Fable" = "DeepSeek";
  if (requestedModel && ['DeepSeek', 'Sonnet', 'Fable'].includes(requestedModel)) {
    modelForPricing = requestedModel as "DeepSeek" | "Sonnet" | "Fable";
  }

  // If payment provided, validate model NOW
  if (paymentSignature) {
    // Validate model parameter is provided
    if (!requestedModel || typeof requestedModel !== 'string') {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: "Missing required field: model. Must be one of: DeepSeek, Sonnet, Fable",
        hint: "The model parameter determines the price. DeepSeek: $0.05, Sonnet: $0.15, Fable: $0.30"
      }));
      return;
    }

    // Validate model is one of the allowed values
    if (!['DeepSeek', 'Sonnet', 'Fable'].includes(requestedModel)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: `Invalid model: ${requestedModel}. Must be one of: DeepSeek, Sonnet, Fable`,
        pricing: {
          DeepSeek: "$0.05 USDC",
          Sonnet: "$0.15 USDC",
          Fable: "$0.30 USDC"
        }
      }));
      return;
    }
  }

  // Skip OpenRouter availability check if no payment yet (for 402 response)
  // Only validate after payment is confirmed
  let openRouterModelId: string | undefined;
  if (paymentSignature) {
    // Payment provided - validate OpenRouter availability
    try {
      openRouterModelId = mapModelName(requestedModel);
    } catch (error: any) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message }));
      return;
    }

    httpLogger.info({
      endpoint: '/get_audit_checklist',
      requestedModel,
      openRouterModelId
    }, "Pre-request validation: Testing OpenRouter availability (primary + fallbacks)");

    try {
      const isAnyModelAvailable = await testOpenRouterAvailability(openRouterModelId);

      if (!isAnyModelAvailable) {
        httpLogger.info({
          requestedModel,
          openRouterModelId
        }, "Primary model not available, will try fallbacks after payment");
      } else {
        httpLogger.info({
          requestedModel,
          openRouterModelId
        }, "Primary model is available");
      }
    } catch (availError: any) {
      httpLogger.warn({
        error: availError.message,
        requestedModel
      }, "Availability check failed, will proceed with payment and try model chain");
    }
  }

  // Get the correct amount based on selected model (or default for 402 response)
  const amount = getAuditChecklistPrice(modelForPricing);

  httpLogger.info({
    endpoint: '/get_audit_checklist',
    requestedModel,
    requiredAmount: `${parseInt(amount) / 1_000_000} USDC`
  }, "Processing request with model-specific pricing");

  // Define schemas and examples
  const inputSchema = {
    type: "object",
    properties: {
      sources: {
        type: "object",
        description: "Map of filename to source code. Required. At least one contract file must be provided.",
        additionalProperties: {
          type: "object",
          properties: {
            content: { type: "string" }
          },
          required: ["content"]
        }
      },
      model: {
        type: "string",
        enum: ["DeepSeek", "Sonnet", "Fable"],
        description: "AI model to use for analysis (Required). DeepSeek ($0.05): fast and cost-effective. Sonnet ($0.15): high quality. Fable ($0.30): premium quality. Payment amount must match selected model."
      },
      maxCategories: {
        type: "number",
        description: "Maximum number of audit categories to match (default: 12, max: 20)",
        minimum: 1,
        maximum: 20
      }
    },
    required: ["sources", "model"]
  };

  const inputExample = {
    sources: {
      "MyToken.sol": {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MyToken {
    string public name = "MyToken";
    mapping(address => uint256) public balances;

    function mint(address to, uint256 amount) public {
        balances[to] += amount;
    }
}`
      }
    },
    model: "DeepSeek",
    maxCategories: 12
  };

  const outputExample = {
    success: true,
    markdown: "# Security Audit Checklist Report\n\n**Contract**: MyToken.sol...",
    matchedCategories: 5,
    model: "openrouter/auto-beta",
    tokensUsed: 3456
  };

  // Create v2Response and requirements with extensions
  // The 402 response shows the exact amount required for the selected model
  const endpointTags = ["security", "audit", "solidity", "smart-contract"];
  const v2Response = createPaymentRequiredResponse(
    resource,
    description,
    amount,
    inputSchema,
    inputExample,
    outputExample,
    endpointTags
  );

  const requirementsWithExtensions = createPaymentRequirements(resource, amount, v2Response.extensions, description, endpointTags);

  // Payment signature was already checked above
  if (!paymentSignature) {
    // No payment - return 402 with v2 payment requirements
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
    const isValid = await verifyPayment(payment, requirementsWithExtensions, resource);

    if (!isValid) {
      res.writeHead(402, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid or unconfirmed payment" }));
      return;
    }

    // Payment verified - process audit checklist request
    // Body, model, and availability were already validated at the beginning
    const { sources, maxCategories = 12 } = body;

    if (!sources || typeof sources !== 'object' || Object.keys(sources).length === 0) {
      res.writeHead(400, {
        "Content-Type": "application/json",
        "PAYMENT-RESPONSE": Buffer.from(JSON.stringify({
          status: "settled",
          network: requirementsWithExtensions.accepts[0]!.network,
          amount: requirementsWithExtensions.accepts[0]!.amount,
        })).toString("base64")
      });
      res.end(JSON.stringify({
        error: "Missing required field: sources. At least one contract file is required.",
        paymentStatus: "settled"
      }));
      return;
    }

    // openRouterModelId was already mapped and validated at the beginning

    // Verify payment amount matches the selected model's price
    // amount was already calculated at the beginning based on the model
    const paidAmount = payment.payload?.authorization?.value?.toString() || "0";

    if (paidAmount !== amount) {
      paymentLogger.error({
        model: requestedModel,
        expectedAmount: amount,
        paidAmount,
        stage: 'payment_amount_mismatch'
      }, 'Payment amount does not match selected model price');

      // CRITICAL: Payment was already settled! Must return 400 with PAYMENT-RESPONSE header
      res.writeHead(400, {
        "Content-Type": "application/json",
        "PAYMENT-RESPONSE": Buffer.from(JSON.stringify({
          status: "settled",
          network: requirementsWithExtensions.accepts[0]!.network,
          amount: requirementsWithExtensions.accepts[0]!.amount,
        })).toString("base64")
      });
      res.end(JSON.stringify({
        error: "Payment amount mismatch",
        details: `Selected model "${requestedModel}" requires ${parseInt(amount) / 1_000_000} USDC, but ${parseInt(paidAmount) / 1_000_000} USDC was paid`,
        expectedAmount: amount,
        paidAmount,
        paymentStatus: "settled"
      }));
      return;
    }

    // Check for OpenRouter API key before processing
    if (!process.env.OPENROUTER_API_KEY) {
      res.writeHead(500, {
        "Content-Type": "application/json",
        "PAYMENT-RESPONSE": Buffer.from(JSON.stringify({
          status: "settled",
          network: requirementsWithExtensions.accepts[0]!.network,
          amount: requirementsWithExtensions.accepts[0]!.amount,
        })).toString("base64")
      });
      res.end(JSON.stringify({
        error: "OpenRouter API key not configured",
        details: "OPENROUTER_API_KEY environment variable is required",
        paymentStatus: "settled"
      }));
      return;
    }

    httpLogger.info({
      contractFiles: Object.keys(sources),
      maxCategories
    }, "Processing audit checklist request");

    // At this point, openRouterModelId must be defined (validated above)
    if (!openRouterModelId) {
      throw new Error("openRouterModelId should have been validated after payment");
    }

    // Load and prepare the audit checklist
    const checklist = loadAuditChecklist();
    const flattenedCategories = flattenCategoriesForPrompt(checklist);
    const categoryListPrompt = generateCategoryListPrompt(flattenedCategories);

    httpLogger.info({
      categoriesLoaded: flattenedCategories.length
    }, "Loaded audit categories from checklist");

    // Process each contract and strip to skeleton
    const contractSkeletons: { filename: string; skeleton: string }[] = [];
    for (const [filename, fileData] of Object.entries(sources)) {
      if (fileData && typeof fileData === 'object' && 'content' in fileData) {
        const skeleton = stripToSkeleton((fileData as any).content);
        contractSkeletons.push({ filename, skeleton });
      }
    }

    // Build the user message with all contract skeletons
    let contractsSection = '';
    for (const { filename, skeleton } of contractSkeletons) {
      contractsSection += `\n# Contract: ${filename}\n\`\`\`solidity\n${skeleton}\n\`\`\`\n`;
    }

    const userMessage = `# Audit categories — choose ONLY from these ${flattenedCategories.length} paths\n${categoryListPrompt}\n${contractsSection}\nReturn at most ${maxCategories} matches, each with a path copied verbatim from the list above.`;

    const systemMessage = `You map a Solidity contract onto a security-audit checklist taxonomy.

You are given a contract SKELETON (declarations only — function bodies have been stripped) and a fixed list of audit categories. Select every category whose checklist items would plausibly produce findings for this contract.

Rules:
1. Each "path" MUST be copied character-for-character from the supplied category list. Never invent, rename, merge, split, abbreviate or re-case a path, and never emit a parent category that is not itself in the list.
2. Base every match on evidence visible in the skeleton — an import, an inherited base, a state variable, an event, a modifier or a function signature. Do not speculate about what the stripped function bodies might contain.
3. Prefer the specific over the generic: if a protocol-specific interface is imported, match that integration's category as well as the general one.
4. Also include cross-cutting categories (access control, external calls, centralisation, low-level operations, compiler-version concerns) when the skeleton shows the corresponding surface area.
5. Return at most the requested number of categories, ordered most to least confident, with no duplicates.
6. "reason" is ONE short sentence naming the specific evidence, e.g. "Inherits ERC20 and defines _mint/_burn." Do not restate the category name.
7. "confidence" is high when the feature is unmistakable, medium when likely, low when plausible but weakly evidenced.
8. If nothing applies — the file is an interface, a library, or holds no contract — return an empty "matches" array and set "skipped_reason".

Return a JSON object with this structure:
{
  "matches": [
    { "path": "exact category path", "reason": "brief evidence", "confidence": "high|medium|low" }
  ],
  "skipped_reason": "optional explanation if no matches"
}`;

    httpLogger.info({ selectedModel: requestedModel, openRouterModelId }, "Sending audit matching request to OpenRouter");

    // Call OpenRouter API with user-selected model
    const openRouterResult = await callOpenRouterJSON<{ matches: AuditMatch[]; skipped_reason?: string }>({
      systemMessage,
      userMessage,
      maxTokens: 32768,
      temperature: 0.7,
      primaryModel: openRouterModelId, // Use user-selected model with its fallbacks
      skipValidation: true, // We already validated availability above
    });

    if (!openRouterResult.success || !openRouterResult.parsed) {
      httpLogger.error({
        error: openRouterResult.error,
        attemptedModels: openRouterResult.attemptedModels
      }, "OpenRouter request failed");
      res.writeHead(500, {
        "Content-Type": "application/json",
        "PAYMENT-RESPONSE": Buffer.from(JSON.stringify({
          status: "settled",
          network: requirementsWithExtensions.accepts[0]!.network,
          amount: requirementsWithExtensions.accepts[0]!.amount,
        })).toString("base64")
      });
      res.end(JSON.stringify({
        error: "AI service request failed",
        details: openRouterResult.error || "Unknown error",
        attemptedModels: openRouterResult.attemptedModels,
        paymentStatus: "settled"
      }));
      return;
    }

    const { parsed, model, tokensUsed } = openRouterResult;
    const matches = parsed.matches || [];
    const skippedReason = parsed.skipped_reason;

    httpLogger.info({
      model,
      tokensUsed,
      matchedCategories: matches.length,
      topCategories: matches.slice(0, 3).map((m: any) => m.path.split('::').pop())
    }, "Audit checklist matching completed successfully");

    // Generate markdown report
    const contractName = contractSkeletons.map(c => c.filename).join(', ');
    const markdownReport = formatAuditReportMarkdown(matches, flattenedCategories, contractName);

    const paymentResponseHeader = Buffer.from(JSON.stringify({
      status: "settled",
      network: requirementsWithExtensions.accepts[0]!.network,
      amount: requirementsWithExtensions.accepts[0]!.amount,
    })).toString("base64");

    res.writeHead(200, {
      "Content-Type": "application/json",
      "PAYMENT-RESPONSE": paymentResponseHeader,
    });

    res.end(JSON.stringify({
      success: true,
      markdown: markdownReport,
      matchedCategories: matches.length,
      skippedReason: skippedReason,
      model: model,
      tokensUsed: tokensUsed
    }));

  } catch (error: any) {
    // Payment was settled, but service failed - provide detailed error info
    const { response: errorResponse, requestId } = createPostPaymentErrorResponse(error, '/get_audit_checklist');

    logError(httpLogger, error, {
      endpoint: '/get_audit_checklist',
      requestId,
      stage: 'post_payment_failure',
      paymentSettled: true
    });

    res.writeHead(500, {
      "Content-Type": "application/json",
      "PAYMENT-RESPONSE": Buffer.from(JSON.stringify({
        status: "settled",
        network: requirementsWithExtensions.accepts[0]!.network,
        amount: requirementsWithExtensions.accepts[0]!.amount,
      })).toString("base64")
    });
    res.end(JSON.stringify(errorResponse));
  }
}

/**
 * Handle /do_audit endpoint - Complete audit report generation
 */
async function handleDoAudit(req: http.IncomingMessage, res: http.ServerResponse) {
  // Prevent duplicate handling if response already sent
  if (res.writableEnded) {
    httpLogger.warn({ endpoint: '/do_audit' }, "Attempted to handle request but response already sent");
    return;
  }

  // CRITICAL: Must use SERVER_BASE_URL for correct resource URLs in production
  if (!process.env.SERVER_BASE_URL) {
    throw new Error("SERVER_BASE_URL environment variable is required");
  }
  const resource = `${process.env.SERVER_BASE_URL}/do_audit`;
  // Use metadata description which includes pricing info
  const description = DO_AUDIT_METADATA.description;

  // Parse request body to get the model parameter
  // But delay validation until after payment check (x402 compliance)
  const body = await parseBody(req);
  const { model: requestedModel } = body;

  // For x402 compliance: Check payment BEFORE validating request parameters
  const paymentSignature = req.headers["payment-signature"] as string;

  // If no payment, use provided model for pricing (or default to DeepSeek)
  let modelForPricing: "DeepSeek" | "Sonnet" | "Fable" = "DeepSeek";
  if (requestedModel && ['DeepSeek', 'Sonnet', 'Fable'].includes(requestedModel)) {
    modelForPricing = requestedModel as "DeepSeek" | "Sonnet" | "Fable";
  }

  // If payment provided, validate model NOW
  if (paymentSignature) {
    // Validate model parameter is provided
    if (!requestedModel || typeof requestedModel !== 'string') {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: "Missing required field: model. Must be one of: DeepSeek, Sonnet, Fable",
        hint: "The model parameter determines the price. DeepSeek: $0.15, Sonnet: $0.25, Fable: $0.70"
      }));
      return;
    }

    // Validate model is one of the allowed values
    if (!['DeepSeek', 'Sonnet', 'Fable'].includes(requestedModel)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: `Invalid model: ${requestedModel}. Must be one of: DeepSeek, Sonnet, Fable`,
        pricing: {
          DeepSeek: "$0.15 USDC",
          Sonnet: "$0.25 USDC",
          Fable: "$0.70 USDC"
        }
      }));
      return;
    }
  }

  // Skip OpenRouter availability check if no payment yet (for 402 response)
  let openRouterModelId: string | undefined;
  if (paymentSignature) {
    // Payment provided - validate OpenRouter availability
    try {
      openRouterModelId = mapModelName(requestedModel);
    } catch (error: any) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message }));
      return;
    }

    httpLogger.info({
      endpoint: '/do_audit',
      requestedModel,
      openRouterModelId
    }, "Pre-request validation: Testing OpenRouter availability (primary + fallbacks)");

    try {
      const isAnyModelAvailable = await testOpenRouterAvailability(openRouterModelId);

      if (!isAnyModelAvailable) {
        httpLogger.info({
          requestedModel,
          openRouterModelId
        }, "Primary model not available, will try fallbacks after payment");
      } else {
        httpLogger.info({
          requestedModel,
          openRouterModelId
        }, "Primary model is available");
      }
    } catch (availError: any) {
      httpLogger.warn({
        error: availError.message,
        requestedModel
      }, "Availability check failed, will proceed with payment and try model chain");
    }
  }

  // Get the correct amount based on selected model (or default for 402 response)
  const amount = getDoAuditPrice(modelForPricing);

  httpLogger.info({
    endpoint: '/do_audit',
    requestedModel,
    requiredAmount: `${parseInt(amount) / 1_000_000} USDC`
  }, "Processing request with model-specific pricing");

  // Define schemas and examples
  const inputSchema = {
    type: "object",
    properties: {
      sources: {
        type: "object",
        description: "Map of filename to source code. Required. At least one contract file must be provided.",
        additionalProperties: {
          type: "object",
          properties: {
            content: { type: "string" }
          },
          required: ["content"]
        }
      },
      checklist: {
        type: "string",
        description: "Audit checklist in markdown format (from get_audit_checklist endpoint or custom checklist)"
      },
      model: {
        type: "string",
        enum: ["DeepSeek", "Sonnet", "Fable"],
        description: "AI model to use for analysis (Required). DeepSeek ($0.15): fast and cost-effective. Sonnet ($0.25): high quality. Fable ($0.70): premium quality. Payment amount must match selected model."
      }
    },
    required: ["sources", "checklist", "model"]
  };

  const inputExample = {
    sources: {
      "MyToken.sol": {
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MyToken {
    string public name = "MyToken";
    mapping(address => uint256) public balances;

    function mint(address to, uint256 amount) public {
        balances[to] += amount;
    }
}`
      }
    },
    checklist: "# Security Audit Checklist Report\n\n**Contract**: MyToken.sol\n\n## Summary\n\n- **ERC20::Token Mechanics** 🔴 `high`\n  - Inherits ERC20 and defines mint function\n\n...",
    model: "Sonnet"
  };

  const outputExample = {
    success: true,
    markdown: "# Complete Security Audit Report\n\n**Contract**: MyToken.sol\n\n## Executive Summary\n\n...\n\n## Findings\n\n### High Severity\n\n...",
    findingsCount: 5,
    severity: {
      critical: 0,
      high: 2,
      medium: 2,
      low: 1,
      informational: 0
    },
    model: "openrouter/auto-beta",
    tokensUsed: 5678
  };

  // Create v2Response and requirements with extensions
  // The 402 response shows the exact amount required for the selected model
  const endpointTags = ["security", "audit", "solidity", "smart-contract", "report"];
  const v2Response = createPaymentRequiredResponse(
    resource,
    description,
    amount,
    inputSchema,
    inputExample,
    outputExample,
    endpointTags
  );

  const requirementsWithExtensions = createPaymentRequirements(resource, amount, v2Response.extensions, description, endpointTags);

  // Payment signature was already checked above
  if (!paymentSignature) {
    // No payment - return 402 with v2 payment requirements
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
    const isValid = await verifyPayment(payment, requirementsWithExtensions, resource);

    if (!isValid) {
      res.writeHead(402, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid or unconfirmed payment" }));
      return;
    }

    // Payment verified - process audit request
    // Body, model, and availability were already validated at the beginning
    const { sources, checklist } = body;

    if (!sources || typeof sources !== 'object' || Object.keys(sources).length === 0) {
      res.writeHead(400, {
        "Content-Type": "application/json",
        "PAYMENT-RESPONSE": Buffer.from(JSON.stringify({
          status: "settled",
          network: requirementsWithExtensions.accepts[0]!.network,
          amount: requirementsWithExtensions.accepts[0]!.amount,
        })).toString("base64")
      });
      res.end(JSON.stringify({
        error: "Missing required field: sources. At least one contract file is required.",
        paymentStatus: "settled"
      }));
      return;
    }

    if (!checklist || typeof checklist !== 'string') {
      res.writeHead(400, {
        "Content-Type": "application/json",
        "PAYMENT-RESPONSE": Buffer.from(JSON.stringify({
          status: "settled",
          network: requirementsWithExtensions.accepts[0]!.network,
          amount: requirementsWithExtensions.accepts[0]!.amount,
        })).toString("base64")
      });
      res.end(JSON.stringify({
        error: "Missing required field: checklist. Provide audit checklist in markdown format.",
        paymentStatus: "settled"
      }));
      return;
    }

    // openRouterModelId was already mapped and validated at the beginning

    // Verify payment amount matches the selected model's price
    // amount was already calculated at the beginning based on the model
    const paidAmount = payment.payload?.authorization?.value?.toString() || "0";

    if (paidAmount !== amount) {
      paymentLogger.error({
        model: requestedModel,
        expectedAmount: amount,
        paidAmount,
        stage: 'payment_amount_mismatch'
      }, 'Payment amount does not match selected model price');

      // CRITICAL: Payment was already settled! Must return 400 with PAYMENT-RESPONSE header
      res.writeHead(400, {
        "Content-Type": "application/json",
        "PAYMENT-RESPONSE": Buffer.from(JSON.stringify({
          status: "settled",
          network: requirementsWithExtensions.accepts[0]!.network,
          amount: requirementsWithExtensions.accepts[0]!.amount,
        })).toString("base64")
      });
      res.end(JSON.stringify({
        error: "Payment amount mismatch",
        details: `Selected model "${requestedModel}" requires ${parseInt(amount) / 1_000_000} USDC, but ${parseInt(paidAmount) / 1_000_000} USDC was paid`,
        expectedAmount: amount,
        paidAmount,
        paymentStatus: "settled"
      }));
      return;
    }

    // Check for OpenRouter API key
    if (!process.env.OPENROUTER_API_KEY) {
      res.writeHead(500, {
        "Content-Type": "application/json",
        "PAYMENT-RESPONSE": Buffer.from(JSON.stringify({
          status: "settled",
          network: requirementsWithExtensions.accepts[0]!.network,
          amount: requirementsWithExtensions.accepts[0]!.amount,
        })).toString("base64")
      });
      res.end(JSON.stringify({
        error: "OpenRouter API key not configured",
        details: "OPENROUTER_API_KEY environment variable is required",
        paymentStatus: "settled"
      }));
      return;
    }

    httpLogger.info({
      contractFiles: Object.keys(sources),
      checklistLength: checklist.length
    }, "Processing complete audit request");

    // At this point, openRouterModelId must be defined (validated above)
    if (!openRouterModelId) {
      throw new Error("openRouterModelId should have been validated after payment");
    }

    // Build contract sources section
    let contractsSection = '';
    for (const [filename, fileData] of Object.entries(sources)) {
      if (fileData && typeof fileData === 'object' && 'content' in fileData) {
        const content = (fileData as any).content;
        contractsSection += `\n## Contract: ${filename}\n\`\`\`solidity\n${content}\n\`\`\`\n`;
      }
    }

    // Build the AI prompt
    const systemMessage = `You are an expert smart contract security auditor. Your task is to analyze Solidity smart contracts and identify security vulnerabilities, bugs, and code quality issues.

You will be given:
1. A security audit checklist (markdown format) with categories and items to check
2. The complete source code of one or more smart contracts

Your job is to:
1. Carefully analyze each contract against the provided checklist
2. Identify specific security issues, vulnerabilities, and concerns
3. Classify each finding by severity: CRITICAL, HIGH, MEDIUM, LOW, or INFORMATIONAL
4. Provide detailed explanations and remediation steps
5. Generate a comprehensive audit report in markdown format

Guidelines:
- Be thorough and specific in your analysis
- Reference exact line numbers and code snippets when identifying issues
- Provide clear, actionable remediation steps
- Focus on real security concerns, not minor style issues
- If a checklist item is not applicable, skip it
- Prioritize findings from most to least severe

Return a JSON object with this structure:
{
  "findings": [
    {
      "title": "Brief title of the issue",
      "severity": "CRITICAL|HIGH|MEDIUM|LOW|INFORMATIONAL",
      "description": "Detailed explanation of the issue",
      "location": "ContractName.sol:LineNumber or function name",
      "code": "Optional code snippet showing the issue",
      "impact": "What could happen if exploited",
      "remediation": "How to fix the issue"
    }
  ],
  "summary": "Brief executive summary of the audit",
  "recommendations": ["General recommendation 1", "General recommendation 2"]
}`;

    const userMessage = `# Audit Checklist

${checklist}

# Smart Contracts to Audit

${contractsSection}

Please perform a complete security audit of the above contracts against the provided checklist. Identify all security issues, vulnerabilities, and concerns.`;

    httpLogger.info({ selectedModel: requestedModel, openRouterModelId }, "Sending audit request to OpenRouter");

    // Call OpenRouter API with user-selected model
    interface AuditResponse {
      findings: any[];
      summary: string;
      recommendations: string[];
    }

    const openRouterResult = await callOpenRouterJSON<AuditResponse>({
      systemMessage,
      userMessage,
      maxTokens: 32768,
      temperature: 0.7,
      primaryModel: openRouterModelId, // Use user-selected model with its fallbacks
      skipValidation: true, // We already validated availability above
    });

    if (!openRouterResult.success || !openRouterResult.parsed) {
      httpLogger.error({
        error: openRouterResult.error,
        attemptedModels: openRouterResult.attemptedModels
      }, "OpenRouter request failed");
      res.writeHead(500, {
        "Content-Type": "application/json",
        "PAYMENT-RESPONSE": Buffer.from(JSON.stringify({
          status: "settled",
          network: requirementsWithExtensions.accepts[0]!.network,
          amount: requirementsWithExtensions.accepts[0]!.amount,
        })).toString("base64")
      });
      res.end(JSON.stringify({
        error: "AI service request failed",
        details: openRouterResult.error || "Unknown error",
        attemptedModels: openRouterResult.attemptedModels,
        paymentStatus: "settled"
      }));
      return;
    }

    const { parsed: auditData, model, tokensUsed } = openRouterResult;
    const findings = auditData.findings || [];
    const summary = auditData.summary || "No summary provided";
    const recommendations = auditData.recommendations || [];

    // Count findings by severity
    const severityCounts = {
      critical: findings.filter((f: any) => f.severity === 'CRITICAL').length,
      high: findings.filter((f: any) => f.severity === 'HIGH').length,
      medium: findings.filter((f: any) => f.severity === 'MEDIUM').length,
      low: findings.filter((f: any) => f.severity === 'LOW').length,
      informational: findings.filter((f: any) => f.severity === 'INFORMATIONAL').length
    };

    httpLogger.info({
      model,
      tokensUsed,
      findingsCount: findings.length,
      severity: severityCounts,
      topFindings: findings.slice(0, 2).map((f: any) => `${f.severity}: ${f.title?.substring(0, 50) || 'N/A'}`)
    }, "Audit completed successfully");

    httpLogger.info({ endpoint: '/do_audit', stage: 'generating_markdown' }, "Starting markdown report generation");

    // Generate markdown audit report
    const reportLines: string[] = [];
    reportLines.push('# Complete Security Audit Report');
    reportLines.push('');
    reportLines.push(`**Contracts Audited**: ${Object.keys(sources).join(', ')}`);
    reportLines.push(`**Date**: ${new Date().toISOString()}`);
    reportLines.push(`**Total Findings**: ${findings.length}`);
    reportLines.push('');
    reportLines.push('## Severity Breakdown');
    reportLines.push('');
    reportLines.push(`- 🔴 **Critical**: ${severityCounts.critical}`);
    reportLines.push(`- 🟠 **High**: ${severityCounts.high}`);
    reportLines.push(`- 🟡 **Medium**: ${severityCounts.medium}`);
    reportLines.push(`- 🟢 **Low**: ${severityCounts.low}`);
    reportLines.push(`- ℹ️ **Informational**: ${severityCounts.informational}`);
    reportLines.push('');
    reportLines.push('---');
    reportLines.push('');
    reportLines.push('## Executive Summary');
    reportLines.push('');
    reportLines.push(summary);
    reportLines.push('');
    reportLines.push('---');
    reportLines.push('');

    // Add findings by severity
    const severityOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL'];
    const severityEmoji: Record<string, string> = {
      'CRITICAL': '🔴',
      'HIGH': '🟠',
      'MEDIUM': '🟡',
      'LOW': '🟢',
      'INFORMATIONAL': 'ℹ️'
    };

    for (const severity of severityOrder) {
      const severityFindings = findings.filter((f: any) => f.severity === severity);

      if (severityFindings.length > 0) {
        reportLines.push(`## ${severityEmoji[severity]} ${severity} Severity Findings`);
        reportLines.push('');

        for (let i = 0; i < severityFindings.length; i++) {
          const finding = severityFindings[i];

          // Safely handle potentially missing or undefined fields
          const title = finding.title || 'Untitled Finding';
          const description = finding.description || 'No description provided';
          const remediation = finding.remediation || 'No remediation provided';

          reportLines.push(`### ${i + 1}. ${title}`);
          reportLines.push('');
          reportLines.push(`**Severity**: ${severity}`);
          if (finding.location) {
            reportLines.push(`**Location**: ${finding.location}`);
          }
          reportLines.push('');
          reportLines.push('**Description**:');
          reportLines.push(description);
          reportLines.push('');

          if (finding.code) {
            reportLines.push('**Code**:');
            reportLines.push('```solidity');
            reportLines.push(String(finding.code));
            reportLines.push('```');
            reportLines.push('');
          }

          if (finding.impact) {
            reportLines.push('**Impact**:');
            reportLines.push(String(finding.impact));
            reportLines.push('');
          }

          reportLines.push('**Remediation**:');
          reportLines.push(remediation);
          reportLines.push('');
          reportLines.push('---');
          reportLines.push('');
        }
      }
    }

    httpLogger.info({ endpoint: '/do_audit', stage: 'markdown_complete', reportLength: reportLines.length }, "Markdown report generation complete");

    // Add recommendations section
    if (recommendations.length > 0) {
      reportLines.push('## General Recommendations');
      reportLines.push('');
      for (const rec of recommendations) {
        reportLines.push(`- ${rec}`);
      }
      reportLines.push('');
    }

    reportLines.push('---');
    reportLines.push('');
    reportLines.push('*Audit report generated by x402 Audit Service powered by OpenRouter*');

    const markdownReport = reportLines.join('\n');

    const paymentResponseHeader = Buffer.from(JSON.stringify({
      status: "settled",
      network: requirementsWithExtensions.accepts[0]!.network,
      amount: requirementsWithExtensions.accepts[0]!.amount,
    })).toString("base64");

    // Prepare response object
    const responseData = {
      success: true,
      markdown: markdownReport,
      findingsCount: findings.length,
      severity: severityCounts,
      model: model,
      tokensUsed: tokensUsed
    };

    // Try to serialize - if it fails, we'll catch it and return an error with PAYMENT-RESPONSE header
    let responseBody: string;
    try {
      responseBody = JSON.stringify(responseData);
    } catch (serializationError: any) {
      httpLogger.error({
        error: serializationError.message,
        markdownLength: markdownReport.length,
        findingsCount: findings.length
      }, "Failed to serialize audit response");

      res.writeHead(500, {
        "Content-Type": "application/json",
        "PAYMENT-RESPONSE": paymentResponseHeader,
      });
      res.end(JSON.stringify({
        error: "Failed to serialize audit response",
        details: serializationError.message,
        paymentStatus: "settled",
        findingsCount: findings.length
      }));
      return;
    }

    httpLogger.info({
      endpoint: '/do_audit',
      status: 200,
      responseBodyLength: responseBody.length,
      findingsCount: findings.length,
      markdownLength: markdownReport.length,
      paymentResponseHeader: paymentResponseHeader.substring(0, 50) + '...',
      responseEnded: res.writableEnded
    }, "Sending successful audit response");

    // Check if response was already sent (duplicate request handling)
    if (res.writableEnded) {
      httpLogger.error({ endpoint: '/do_audit' }, "Cannot send response - response already ended");
      return;
    }

    try {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "PAYMENT-RESPONSE": paymentResponseHeader,
      });

      res.end(responseBody);

      httpLogger.info({ endpoint: '/do_audit' }, "Response sent successfully");
    } catch (writeError: any) {
      httpLogger.error({
        endpoint: '/do_audit',
        error: writeError.message,
        stack: writeError.stack
      }, "Failed to write response");
      // Don't throw - response might have been partially sent
    }

  } catch (error: any) {
    // Payment was settled, but service failed - provide detailed error info
    const { response: errorResponse, requestId } = createPostPaymentErrorResponse(error, '/do_audit');

    logError(httpLogger, error, {
      endpoint: '/do_audit',
      requestId,
      stage: 'post_payment_failure',
      paymentSettled: true
    });

    res.writeHead(500, {
      "Content-Type": "application/json",
      "PAYMENT-RESPONSE": Buffer.from(JSON.stringify({
        status: "settled",
        network: requirementsWithExtensions.accepts[0]!.network,
        amount: requirementsWithExtensions.accepts[0]!.amount,
      })).toString("base64")
    });
    res.end(JSON.stringify(errorResponse));
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
      get_audit_checklist: {
        path: "/get_audit_checklist",
        method: "POST",
        pricing: {
          DeepSeek: `${parseFloat(TOOL_CONFIG.payments.getAuditChecklist.DeepSeek) / 1_000_000} USDC`,
          Sonnet: `${parseFloat(TOOL_CONFIG.payments.getAuditChecklist.Sonnet) / 1_000_000} USDC`,
          Fable: `${parseFloat(TOOL_CONFIG.payments.getAuditChecklist.Fable) / 1_000_000} USDC`,
        },
        description: "AI-powered smart contract audit checklist matching (price varies by model)",
      },
      do_audit: {
        path: "/do_audit",
        method: "POST",
        pricing: {
          DeepSeek: `${parseFloat(TOOL_CONFIG.payments.doAudit.DeepSeek) / 1_000_000} USDC`,
          Sonnet: `${parseFloat(TOOL_CONFIG.payments.doAudit.Sonnet) / 1_000_000} USDC`,
          Fable: `${parseFloat(TOOL_CONFIG.payments.doAudit.Fable) / 1_000_000} USDC`,
        },
        description: "Complete AI-powered security audit report (price varies by model)",
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
    httpLogger.warn("PAY_TO_ADDRESS not set. HTTP x402 server will not start. Set PAY_TO_ADDRESS environment variable to enable HTTP REST endpoints.");
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
      // Route requests - support both root paths and /mcp/x402-http prefix
      if ((url.pathname === "/compile" || url.pathname === "/mcp/x402-http/compile") && req.method === "POST") {
        await handleCompile(req, res);
      } else if ((url.pathname === "/analyze" || url.pathname === "/mcp/x402-http/analyze") && req.method === "POST") {
        await handleAnalyze(req, res);
      } else if ((url.pathname === "/get_audit_checklist" || url.pathname === "/mcp/x402-http/get_audit_checklist") && req.method === "POST") {
        await handleGetAuditChecklist(req, res);
      } else if ((url.pathname === "/do_audit" || url.pathname === "/mcp/x402-http/do_audit") && req.method === "POST") {
        await handleDoAudit(req, res);
      } else if (url.pathname === "/" || url.pathname === "/info" || url.pathname === "/mcp/x402-http" || url.pathname === "/mcp/x402-http/") {
        handleInfo(req, res);
      } else if (url.pathname === "/health" || url.pathname === "/mcp/x402-http/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "healthy" }));
      } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          error: "Not found",
          availableEndpoints: ["/mcp/x402-http/compile", "/mcp/x402-http/analyze", "/mcp/x402-http/get_audit_checklist", "/mcp/x402-http/do_audit", "/mcp/x402-http/health"],
        }));
      }
    } catch (error: any) {
      logError(httpLogger, error, { context: 'Request handling' });
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  });

  // Set server timeout to match maxTimeoutSeconds (300s) + buffer for processing
  // This prevents the server from cutting off long-running audit requests
  server.timeout = 360000; // 360 seconds = 6 minutes (300s + 60s buffer)
  server.keepAliveTimeout = 365000; // Slightly higher than timeout

  server.listen(HTTP_X402_PORT, () => {
    // Validate required environment variables
    if (!process.env.SERVER_BASE_URL) {
      httpLogger.error("CRITICAL: SERVER_BASE_URL environment variable is not set! This is REQUIRED for correct resource URLs in production. Without it, internal hostnames will leak into payment responses.");
      process.exit(1);
    }

    httpLogger.info({
      port: HTTP_X402_PORT,
      baseUrl: process.env.SERVER_BASE_URL,
      endpoints: {
        compile: `POST /mcp/x402-http/compile (${parseFloat(TOOL_CONFIG.payments.compileSolidity) / 1_000_000} USDC)`,
        analyze: `POST /mcp/x402-http/analyze (${parseFloat(TOOL_CONFIG.payments.analyzeWithSlither) / 1_000_000} USDC)`,
        get_audit_checklist: `POST /mcp/x402-http/get_audit_checklist (DeepSeek: ${parseFloat(TOOL_CONFIG.payments.getAuditChecklist.DeepSeek) / 1_000_000}, Sonnet: ${parseFloat(TOOL_CONFIG.payments.getAuditChecklist.Sonnet) / 1_000_000}, Fable: ${parseFloat(TOOL_CONFIG.payments.getAuditChecklist.Fable) / 1_000_000} USDC)`,
        do_audit: `POST /mcp/x402-http/do_audit (DeepSeek: ${parseFloat(TOOL_CONFIG.payments.doAudit.DeepSeek) / 1_000_000}, Sonnet: ${parseFloat(TOOL_CONFIG.payments.doAudit.Sonnet) / 1_000_000}, Fable: ${parseFloat(TOOL_CONFIG.payments.doAudit.Fable) / 1_000_000} USDC)`,
        info: 'GET /mcp/x402-http/',
        health: 'GET /mcp/x402-http/health'
      },
      rootPathsSupported: ['/compile', '/analyze', '/get_audit_checklist', '/do_audit', '/health']
    }, "HTTP x402 Server started successfully");
  });

  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      httpLogger.error({ port: HTTP_X402_PORT }, "Port already in use. HTTP x402 server not started");
    } else {
      logError(httpLogger, error, { context: 'HTTP x402 server startup' });
    }
  });

  return server;
}
