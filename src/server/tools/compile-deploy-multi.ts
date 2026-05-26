import { withX402Payment, type FastMCP } from "@ampersend_ai/ampersend-sdk/mcp/server/fastmcp";
import { z } from "zod";
import { Compiler } from "@remix-project/remix-solidity";
import { createPaymentRequirements, handlePayment } from "../utils/payment.js";
import { getRpcUrl } from "../config/network.js";

// Helper function to dynamically get chain from viem
async function getChainFromViem(networkName: string): Promise<any> {
  const viemChains = await import("viem/chains");

  // Convert kebab-case to camelCase (e.g., "base-sepolia" -> "baseSepolia")
  const camelCaseName = networkName.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

  // Try to find the chain in viem
  const chain = (viemChains as any)[camelCaseName];

  if (!chain) {
    throw new Error(`Network "${networkName}" not found in viem/chains. Please check the network name.`);
  }

  return chain;
}

export function registerMultiNetworkDeploymentTool(mcp: FastMCP) {
  mcp.addTool({
    name: "compile_and_deploy_multi_network",
    description: "Compile once and deploy Solidity contracts to multiple networks simultaneously. Server compiles and deploys the contract using its own funded wallet across all specified networks. Optionally call a contract method immediately after each deployment. Client pays for total gas costs + service fee via X402 payment.",
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
      networks: z.array(z.string()).describe("Array of networks to deploy to (e.g., 'base-sepolia', 'sepolia', 'polygon', 'arbitrum', etc. - any network supported by viem/chains)"),
      postDeploymentCall: z.object({
        methodName: z.string().describe("Name of the method to call after deployment"),
        methodArgs: z.array(z.any()).optional().describe("Arguments to pass to the method")
      }).optional().describe("Optional method to call immediately after each deployment")
    }),
    execute: withX402Payment({
      onExecute: async (context: { args: any }) => {
        const args = context.args;

        try {
          console.log(`📊 Estimating multi-network deployment costs...`);
          console.log(`   Contract: ${args.contractName}`);
          console.log(`   Networks: ${args.networks.join(", ")}`);

          // Step 1: Compile the contract once
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
                reject(new Error("Compilation failed during gas estimation"));
              }
            });

            compiler.event.register("compilerLoaded", () => {
              compiler.compile(args.sources, "");
            });

            compiler.loadRemoteVersion("v0.8.26+commit.8a97fa7a");
          });

          const contractData = compilationResult.contracts[args.contractFile]?.[args.contractName];
          if (!contractData) {
            throw new Error(`Contract ${args.contractName} not found`);
          }

          const bytecode = contractData.evm?.bytecode?.object;
          const abi = contractData.abi;

          if (!bytecode || !abi) {
            throw new Error("Missing bytecode or ABI from compilation");
          }

          // Step 2: Estimate gas for each network
          const { createPublicClient, http, encodeDeployData } = await import("viem");
          const { privateKeyToAccount } = await import("viem/accounts");

          const SERVER_DEPLOYER_KEY = process.env.SERVER_DEPLOYER_PRIVATE_KEY;
          if (!SERVER_DEPLOYER_KEY) {
            throw new Error("Server deployer not configured");
          }

          const account = privateKeyToAccount(SERVER_DEPLOYER_KEY as `0x${string}`);

          const deploymentData = encodeDeployData({
            abi,
            bytecode: `0x${bytecode}` as `0x${string}`,
            args: args.constructorArgs || []
          });

          let totalCostUsd = 0;
          const networkEstimates: any[] = [];

          // Estimate for each network
          for (const network of args.networks) {
            let chain;
            try {
              chain = await getChainFromViem(network);
            } catch (error: any) {
              throw new Error(`Failed to load chain "${network}": ${error.message}`);
            }

            // Use configured RPC URL if available
            const rpcUrl = getRpcUrl(network);
            const publicClient = createPublicClient({
              chain,
              transport: http(rpcUrl)
            });

            console.log(`\n   Estimating for ${network}...`);

            try {
              const deployGasEstimate = await publicClient.estimateGas({
                account,
                data: deploymentData
              });

              let totalGasEstimate = deployGasEstimate;

              // Estimate post-deployment call if specified
              if (args.postDeploymentCall) {
                try {
                  const { getContractAddress } = await import("viem");
                  const nonce = await publicClient.getTransactionCount({
                    address: account.address
                  });

                  const predictedAddress = getContractAddress({
                    from: account.address,
                    nonce: BigInt(nonce)
                  });

                  const methodCallEstimate = await publicClient.estimateContractGas({
                    address: predictedAddress,
                    abi,
                    functionName: args.postDeploymentCall.methodName,
                    args: args.postDeploymentCall.methodArgs || [],
                    account
                  });

                  totalGasEstimate = totalGasEstimate + methodCallEstimate;
                } catch {
                  // Fallback estimate
                  totalGasEstimate = totalGasEstimate + BigInt(150000);
                }
              }

              const gasPrice = await publicClient.getGasPrice();
              const gasCostWei = (totalGasEstimate * gasPrice * BigInt(120)) / BigInt(100);

              const ethUsdPrice = 3000;
              const gasCostEth = Number(gasCostWei) / 1e18;
              const gasCostUsd = gasCostEth * ethUsdPrice;

              networkEstimates.push({
                network,
                gasEstimate: totalGasEstimate.toString(),
                gasPrice: gasPrice.toString(),
                costUsd: gasCostUsd
              });

              totalCostUsd += gasCostUsd;

              console.log(`     Gas: ${totalGasEstimate}, Cost: $${gasCostUsd.toFixed(6)}`);
            } catch (error: any) {
              console.log(`     ⚠️  Estimation failed for ${network}: ${error.message}`);
              // Use fallback pricing
              const fallbackCost = 0.05;
              totalCostUsd += fallbackCost;
              networkEstimates.push({
                network,
                error: error.message,
                costUsd: fallbackCost
              });
            }
          }

          // Add service fees
          const serviceFee = totalCostUsd * 0.3;
          const gasWithServiceFee = totalCostUsd + serviceFee;
          const baseFee = 0.05;

          // Add additional 10% buffer for multi-network deployments to account for nonce changes
          const multiNetworkBuffer = gasWithServiceFee * 0.1;
          const finalCostUsd = gasWithServiceFee + baseFee + multiNetworkBuffer;
          const usdcAmount = Math.ceil(finalCostUsd * 1_000_000).toString();

          console.log(`\n   Total Gas Cost: $${totalCostUsd.toFixed(6)} USD`);
          console.log(`   Service Fee (30%): $${serviceFee.toFixed(6)} USD`);
          console.log(`   Base Service Fee: $${baseFee.toFixed(6)} USD`);
          console.log(`   Multi-Network Buffer (10%): $${multiNetworkBuffer.toFixed(6)} USD`);
          console.log(`   Total Cost: $${finalCostUsd.toFixed(6)} USD`);

          return createPaymentRequirements(
            "compile_and_deploy_multi_network",
            usdcAmount,
            `Payment for multi-network deployment of ${args.contractName} to ${args.networks.length} networks (${args.networks.join(", ")}) - Total: ${finalCostUsd.toFixed(6)} USDC`
          );

        } catch (error: any) {
          console.error(`❌ Multi-network gas estimation failed:`, error.message);

          // Fallback: 0.05 USDC per network
          const fallbackCostPerNetwork = 0.05;
          const totalNetworks = args.networks.length;
          const fallbackTotal = fallbackCostPerNetwork * totalNetworks;
          const usdcAmount = Math.ceil(fallbackTotal * 1_000_000).toString();

          return createPaymentRequirements(
            "compile_and_deploy_multi_network",
            usdcAmount,
            `Payment for multi-network deployment to ${totalNetworks} networks (gas estimation failed: ${error.message})`
          );
        }
      },
      onPayment: handlePayment,
    })(async (args: {
      sources: Record<string, { content: string }>,
      contractName: string,
      contractFile: string,
      constructorArgs?: any[],
      settings?: any,
      networks: string[],
      postDeploymentCall?: {
        methodName: string,
        methodArgs?: any[]
      }
    }, _context: any) => {
      try {
        console.log(`🔨 Starting multi-network compilation and deployment...`);
        console.log(`   Contract: ${args.contractName}`);
        console.log(`   Networks: ${args.networks.join(", ")}`);

        // Step 1: Compile once
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

        const contractData = compilationResult.contracts[args.contractFile]?.[args.contractName];
        if (!contractData) {
          return JSON.stringify({
            success: false,
            error: `Contract ${args.contractName} not found`
          }, null, 2);
        }

        const bytecode = contractData.evm?.bytecode?.object;
        const abi = contractData.abi;

        if (!bytecode || !abi) {
          return JSON.stringify({
            success: false,
            error: "Missing bytecode or ABI"
          }, null, 2);
        }

        // Step 2: Deploy to each network
        const { createWalletClient, http, publicActions } = await import("viem");
        const { privateKeyToAccount } = await import("viem/accounts");

        const SERVER_DEPLOYER_KEY = process.env.SERVER_DEPLOYER_PRIVATE_KEY;
        if (!SERVER_DEPLOYER_KEY) {
          return JSON.stringify({
            success: false,
            error: "Server deployer not configured"
          }, null, 2);
        }

        const deployerAccount = privateKeyToAccount(SERVER_DEPLOYER_KEY as `0x${string}`);
        const deployments: any[] = [];

        for (const network of args.networks) {
          console.log(`\n🚀 Deploying to ${network}...`);

          let chain;
          try {
            chain = await getChainFromViem(network);
          } catch (error: any) {
            deployments.push({
              network,
              success: false,
              error: `Failed to load chain: ${error.message}`
            });
            continue;
          }

          try {
            // Use configured RPC URL if available
            const rpcUrl = getRpcUrl(network);
            const walletClient = createWalletClient({
              account: deployerAccount,
              chain,
              transport: http(rpcUrl)
            }).extend(publicActions);

            const hash = await walletClient.deployContract({
              abi,
              bytecode: `0x${bytecode}` as `0x${string}`,
              args: args.constructorArgs || [],
              account: deployerAccount,
              chain,
            });

            console.log(`   Transaction: ${hash}`);
            console.log(`   Waiting for confirmation...`);

            const receipt = await walletClient.waitForTransactionReceipt({ hash });

            console.log(`   ✅ Deployed at: ${receipt.contractAddress}`);

            const deploymentResult: any = {
              network,
              success: true,
              contractAddress: receipt.contractAddress,
              transactionHash: hash,
              blockNumber: receipt.blockNumber.toString(),
              gasUsed: receipt.gasUsed.toString(),
            };

            // Post-deployment call if specified
            if (args.postDeploymentCall && receipt.contractAddress) {
              console.log(`   🔧 Calling ${args.postDeploymentCall.methodName}...`);

              try {
                const callHash = await walletClient.writeContract({
                  address: receipt.contractAddress,
                  abi,
                  functionName: args.postDeploymentCall.methodName,
                  args: args.postDeploymentCall.methodArgs || [],
                  account: deployerAccount,
                  chain,
                });

                const callReceipt = await walletClient.waitForTransactionReceipt({ hash: callHash });

                // Check if transaction reverted
                if (callReceipt.status === 'reverted' || callReceipt.status === 0n) {
                  console.log(`   ❌ Method call reverted`);
                  deploymentResult.postDeploymentCall = {
                    success: false,
                    methodName: args.postDeploymentCall.methodName,
                    transactionHash: callHash,
                    error: 'Transaction reverted'
                  };
                } else {
                  console.log(`   ✅ Method call successful`);
                  deploymentResult.postDeploymentCall = {
                    success: true,
                    methodName: args.postDeploymentCall.methodName,
                    transactionHash: callHash,
                    gasUsed: callReceipt.gasUsed.toString()
                  };
                }
              } catch (callError: any) {
                console.log(`   ❌ Method call failed: ${callError.message}`);
                deploymentResult.postDeploymentCall = {
                  success: false,
                  methodName: args.postDeploymentCall.methodName,
                  error: callError.message
                };
              }
            }

            deployments.push(deploymentResult);

          } catch (error: any) {
            console.error(`   ❌ Deployment to ${network} failed: ${error.message}`);
            deployments.push({
              network,
              success: false,
              error: error.message
            });
          }
        }

        const allSuccessful = deployments.every(d => d.success);

        return JSON.stringify({
          success: allSuccessful,
          compilation: {
            warnings: compilationResult.errors || []
          },
          deployments,
          abi,
          summary: {
            total: args.networks.length,
            successful: deployments.filter(d => d.success).length,
            failed: deployments.filter(d => !d.success).length
          }
        }, null, 2);

      } catch (error: any) {
        console.error(`❌ Multi-network deployment failed:`, error.message);
        return JSON.stringify({
          success: false,
          error: error.message,
          details: error.stack
        }, null, 2);
      }
    }),
  });
}
