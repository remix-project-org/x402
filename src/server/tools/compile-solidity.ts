import { withX402Payment, type FastMCP } from "@ampersend_ai/ampersend-sdk/mcp/server/fastmcp";
import { z } from "zod";
import { Compiler } from "@remix-project/remix-solidity";
import { createPaymentRequirements, handlePayment } from "../utils/payment.js";
import { TOOL_CONFIG } from "../config/tools.js";

export function registerCompileSolidityTool(mcp: FastMCP) {
  mcp.addTool({
  name: "compile_solidity",
  description: "Compile Solidity contracts using Remix compiler. Accepts contract sources and returns compilation results.",
  parameters: z.object({
    sources: z.record(z.string(), z.object({
      content: z.string()
    })).describe("Object with contract filenames as keys and their content"),
    version: z.string().optional().describe("Solidity compiler version (e.g., 'v0.8.35+commit.47b9dedd'). If not specified, uses the default version."),
    settings: z.object({
      optimizer: z.object({
        enabled: z.boolean().optional(),
        runs: z.number().optional()
      }).optional(),
      evmVersion: z.string().optional()
    }).optional().describe("Optional compiler settings")
  }),
  execute: withX402Payment({
    onExecute: async (_context: { args: unknown }) => {
      return createPaymentRequirements(
        "compile_solidity",
        TOOL_CONFIG.payments.compileSolidity,
        "Payment for Solidity compilation"
      );
    },
    onPayment: handlePayment,
  })(async (args: { sources: Record<string, { content: string }>, version?: string, settings?: any }, _context: any) => {
    try {
      // Create compiler instance with import callback
      const compiler = new Compiler((importPath: string, cb: Function) => {
        const content = args.sources[importPath]?.content || "";
        cb(null, { content });
      });

      // Compile the contracts
      return new Promise((resolve) => {
        // Determine compiler version to use
        const compilerVersion = args.version ?? TOOL_CONFIG.compiler.version;

        // Set compiler options
        compiler.set("evmVersion", args.settings?.evmVersion ?? TOOL_CONFIG.compiler.defaultSettings.evmVersion);
        compiler.set("optimize", args.settings?.optimizer?.enabled ?? TOOL_CONFIG.compiler.defaultSettings.optimizer.enabled);
        compiler.set("runs", args.settings?.optimizer?.runs ?? TOOL_CONFIG.compiler.defaultSettings.optimizer.runs);

        // Register compilation finished event
        compiler.event.register("compilationFinished", (success: boolean, data: any, _source: any) => {
          if (success) {
            const result = {
              success: true,
              contracts: data.contracts,
              sources: data.sources,
              errors: data.errors?.filter((e: any) => e.severity === "warning") || [],
              settings: {
                optimizer: {
                  enabled: args.settings?.optimizer?.enabled ?? TOOL_CONFIG.compiler.defaultSettings.optimizer.enabled,
                  runs: args.settings?.optimizer?.runs ?? TOOL_CONFIG.compiler.defaultSettings.optimizer.runs
                },
                evmVersion: args.settings?.evmVersion ?? TOOL_CONFIG.compiler.defaultSettings.evmVersion
              },
              version: compilerVersion
            };
            resolve(JSON.stringify(result, null, 2));
          } else {
            const result = {
              success: false,
              errors: data.errors || [],
              version: compilerVersion
            };
            resolve(JSON.stringify(result, null, 2));
          }
        });

        // Register compiler loaded event
        compiler.event.register("compilerLoaded", () => {
          // Compile with sources after compiler is loaded
          compiler.compile(args.sources, "");
        });

        // Use loadRemoteVersion for Node.js compatibility (no browser APIs)
        compiler.loadRemoteVersion(compilerVersion);
      });
    } catch (error: any) {
      const result = {
        success: false,
        error: error.message || "Compilation failed"
      };
      return JSON.stringify(result, null, 2);
    }
  }),
  });
}
