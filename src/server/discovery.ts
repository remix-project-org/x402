/**
 * Bazaar Discovery HTTP Server
 *
 * This server exposes the /discovery endpoint for x402 Bazaar indexing.
 * It runs alongside the MCP server and provides metadata for all tools.
 */

import http from "http";
import { getBazaarDiscoveryResponse } from "./config/bazaar.js";

const DISCOVERY_PORT = process.env.DISCOVERY_PORT ? parseInt(process.env.DISCOVERY_PORT) : 8001;

/**
 * Create and start the discovery HTTP server
 */
export function startDiscoveryServer() {
  const server = http.createServer((req, res) => {
    // Enable CORS for all origins
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    // Handle preflight
    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    // Parse URL
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    // Handle /discovery endpoint
    if (url.pathname === "/discovery" || url.pathname === "/discovery/") {
      if (req.method === "GET") {
        try {
          const discoveryData = getBazaarDiscoveryResponse();

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(discoveryData, null, 2));

          console.log(`[Discovery] Served metadata for ${discoveryData.resources.length} tools`);
        } catch (error) {
          console.error("[Discovery] Error generating metadata:", error);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Failed to generate discovery metadata" }));
        }
      } else {
        res.writeHead(405, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Method not allowed" }));
      }
    }
    // Handle /health endpoint
    else if (url.pathname === "/health" || url.pathname === "/health/") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: "healthy",
        timestamp: new Date().toISOString(),
        service: "x402-discovery"
      }));
    }
    // Handle root
    else if (url.pathname === "/" || url.pathname === "") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        name: "Remix x402 Discovery Server",
        version: "1.0.0",
        endpoints: {
          discovery: "/discovery",
          health: "/health",
          mcp: "http://localhost:8000/mcp"
        }
      }));
    }
    // 404 for everything else
    else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: "Not found",
        availableEndpoints: ["/", "/discovery", "/health"]
      }));
    }
  });

  server.listen(DISCOVERY_PORT, () => {
    console.log(`\n🔍 Discovery Server running on http://localhost:${DISCOVERY_PORT}`);
    console.log(`   Discovery endpoint: http://localhost:${DISCOVERY_PORT}/discovery`);
    console.log(`   Health check: http://localhost:${DISCOVERY_PORT}/health`);
    console.log(`\n📡 For Bazaar indexing, expose: http://localhost:${DISCOVERY_PORT}/discovery`);
  });

  // Handle server errors
  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      console.error(`❌ Port ${DISCOVERY_PORT} is already in use. Discovery server not started.`);
      console.error(`   Set DISCOVERY_PORT environment variable to use a different port.`);
    } else {
      console.error("❌ Discovery server error:", error);
    }
  });

  return server;
}

/**
 * Graceful shutdown handler
 */
export function setupGracefulShutdown(server: http.Server) {
  const shutdown = () => {
    console.log("\n🛑 Shutting down discovery server...");
    server.close(() => {
      console.log("✅ Discovery server stopped");
      process.exit(0);
    });

    // Force shutdown after 5 seconds
    setTimeout(() => {
      console.error("❌ Could not close connections in time, forcefully shutting down");
      process.exit(1);
    }, 5000);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
