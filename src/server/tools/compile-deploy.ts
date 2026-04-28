import { withX402Payment, type FastMCP } from "@ampersend_ai/ampersend-sdk/mcp/server/fastmcp";
import { z } from "zod";
import { Compiler } from "@remix-project/remix-solidity";
import { createPaymentRequirements, handlePayment } from "../utils/payment.js";

export function registerCompileAndDeploymentTool(mcp: FastMCP) {
  mcp.addTool({
  name: "compile_and_deploy",
  description: "Compile and deploy Solidity contracts using the server's Delegated Deployment Service. Server compiles and deploys the contract using its own funded wallet. Client pays for gas costs + service fee via X402 payment.",
  parameters: z.object({
    sources: z.record(z.string(), z.object({
      content: z.string()
    })).describe("Object with contract filenames as keys and their content"),
    contractName: z.string().describe("Name of the main contract to deploy (e.g., 'MyContract')"),
    contractFile: z.string().describe("Filename containing the contract to deploy (e.g., 'MyContract.sol')"),
    constructorArgs: z.array(z.any()).optional().describe("Optional constructor arguments for deployment"),
    settings: z.object({
      optimizer: z.object({
        enabled: z.boolean().optional(),
        runs: z.number().optional()
      }).optional(),
      evmVersion: z.string().optional()
    }).optional().describe("Optional compiler settings"),
    network: z.enum(["base-sepolia", "base", "avalanche-fuji", "avalanche", "polygon", "polygon-amoy"]).describe("Network to deploy to")
  }),
  execute: withX402Payment({
    onExecute: async (_context: { args: unknown }) => {
      return createPaymentRequirements(
        "compile_and_deploy",
        "50000", // 0.05 USDC
        "Payment for compilation and delegated deployment service"
      );
    },
    onPayment: handlePayment,
  })(async (args: {
    sources: Record<string, { content: string }>,
    contractName: string,
    contractFile: string,
    constructorArgs?: any[],
    settings?: any,
    network: string
  }, _context: any) => {
    try {
      console.log(`🔨 Starting compilation and deployment...`);
      console.log(`   Contract: ${args.contractName}`);
      console.log(`   Network: ${args.network}`);

      // Step 1: Compile the contract
      const compiler = new Compiler((importPath: string, cb: Function) => {
        const content = args.sources[importPath]?.content || "";
        cb(null, { content });
      });

      const compilationResult: any = await new Promise((resolve, reject) => {
        compiler.set("evmVersion", args.settings?.evmVersion ?? "london");
        compiler.set("optimize", args.settings?.optimizer?.enabled ?? true);
        compiler.set("runs", args.settings?.optimizer?.runs ?? 200);

        compiler.event.register("compilationFinished", (success: boolean, data: any, _source: any) => {
          if (success) {
            resolve({
              success: true,
              contracts: data.contracts,
              sources: data.sources,
              errors: data.errors?.filter((e: any) => e.severity === "warning") || []
            });
          } else {
            reject(new Error(JSON.stringify({
              success: false,
              errors: data.errors || []
            })));
          }
        });

        compiler.event.register("compilerLoaded", () => {
          compiler.compile(args.sources, "");
        });

        compiler.loadRemoteVersion("v0.8.26+commit.8a97fa7a");
      });

      if (!compilationResult.success) {
        return JSON.stringify({
          success: false,
          error: "Compilation failed",
          details: compilationResult
        }, null, 2);
      }

      console.log(`✅ Compilation successful`);

      // Step 2: Extract bytecode and ABI
      const contractData = compilationResult.contracts[args.contractFile]?.[args.contractName];

      if (!contractData) {
        return JSON.stringify({
          success: false,
          error: `Contract ${args.contractName} not found in ${args.contractFile}`,
          availableContracts: Object.keys(compilationResult.contracts[args.contractFile] || {})
        }, null, 2);
      }

      const bytecode = contractData.evm?.bytecode?.object;
      const abi = contractData.abi;

      if (!bytecode || !abi) {
        return JSON.stringify({
          success: false,
          error: "Missing bytecode or ABI from compilation output"
        }, null, 2);
      }

      console.log(`📝 Contract ABI and bytecode extracted`);

      // Step 3: Deploy using server's delegated deployer wallet
      const { createWalletClient, http, publicActions } = await import("viem");
      const { privateKeyToAccount } = await import("viem/accounts");
      const viemChains = await import("viem/chains");

      // Check if server deployer private key is configured
      const SERVER_DEPLOYER_KEY = process.env.SERVER_DEPLOYER_PRIVATE_KEY;
      if (!SERVER_DEPLOYER_KEY) {
        return JSON.stringify({
          success: false,
          error: "Server deployer wallet not configured. Please set SERVER_DEPLOYER_PRIVATE_KEY environment variable."
        }, null, 2);
      }

      // Map network name to viem chain
      const chainMap: Record<string, any> = {
        "base-sepolia": viemChains.baseSepolia,
        "base": viemChains.base,
        "avalanche-fuji": viemChains.avalancheFuji,
        "avalanche": viemChains.avalanche,
        "polygon": viemChains.polygon,
        "polygon-amoy": viemChains.polygonAmoy,
      };

      const chain = chainMap[args.network];
      if (!chain) {
        return JSON.stringify({
          success: false,
          error: `Unsupported network: ${args.network}`
        }, null, 2);
      }

      // Create server's deployer account
      const deployerAccount = privateKeyToAccount(SERVER_DEPLOYER_KEY as `0x${string}`);

      // Create wallet client
      const walletClient = createWalletClient({
        account: deployerAccount,
        chain,
        transport: http()
      }).extend(publicActions);

      console.log(`🚀 Deploying contract using server's delegated deployer...`);
      console.log(`   Deployer address: ${deployerAccount.address}`);

      // Deploy contract
      const hash = await walletClient.deployContract({
        abi,
        bytecode: `0x${bytecode}` as `0x${string}`,
        args: args.constructorArgs || [],
        account: deployerAccount,
        chain,
      });

      console.log(`📡 Transaction sent: ${hash}`);
      console.log(`⏳ Waiting for transaction confirmation...`);

      // Wait for transaction receipt
      const receipt = await walletClient.waitForTransactionReceipt({ hash });

      console.log(`✅ Contract deployed successfully!`);
      console.log(`   Address: ${receipt.contractAddress}`);
      console.log(`   Block: ${receipt.blockNumber}`);

      return JSON.stringify({
        success: true,
        compilation: {
          warnings: compilationResult.errors || []
        },
        deployment: {
          contractAddress: receipt.contractAddress,
          transactionHash: hash,
          blockNumber: receipt.blockNumber.toString(),
          gasUsed: receipt.gasUsed.toString(),
          status: receipt.status,
          network: args.network,
          deployedBy: "server-delegated-deployer",
          deployerAddress: deployerAccount.address
        },
        abi: abi
      }, null, 2);

    } catch (error: any) {
      console.error(`❌ Compilation and deployment failed:`, error.message);
      return JSON.stringify({
        success: false,
        error: error.message || "Compilation and deployment failed",
        details: error.stack
      }, null, 2);
    }
  }),
  });
}
