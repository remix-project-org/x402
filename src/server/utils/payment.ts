import { verify } from "x402/facilitator";
import { createConnectedClient } from "x402/types";

/**
 * Create payment requirements for a tool
 */
export function createPaymentRequirements(
  resource: string,
  amount: string,
  description: string
) {
  return {
    scheme: "exact" as const,
    description,
    network: "base-sepolia" as const,
    maxAmountRequired: amount,
    resource,
    mimeType: "application/json",
    payTo: process.env.PAY_TO_ADDRESS as string,
    maxTimeoutSeconds: 300,
    asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // USDC on Base Sepolia
  };
}

/**
 * Verify payment has been settled on-chain
 */
export async function verifyPayment(payment: any, requirements: any): Promise<void> {
  console.log(`💰 Received payment authorization`);
  console.log(`   From: ${payment.payload?.authorization?.from || 'unknown'}`);
  console.log(`   To: ${payment.payload?.authorization?.to || 'unknown'}`);
  console.log(`   Amount: ${payment.payload?.authorization?.value || '0'} USDC`);
  console.log(`   Network: ${payment.network}`);

  console.log(`\n⛓️  Verifying payment settlement on-chain...`);

  try {
    const client = createConnectedClient(requirements.network);
    console.log("   Payment object received:", JSON.stringify(payment, null, 2));

    const verifyResponse = await verify(client, payment, requirements);

    if (verifyResponse.isValid) {
      console.log(`✅ Payment verified as settled on-chain!`);
      console.log(`   Client settled and paid gas fees`);
      console.log(`   Server received USDC payment`);
    } else {
      console.log(`❌ Payment verification failed: ${verifyResponse.invalidReason}`);
      throw new Error(`Payment not settled on-chain: ${verifyResponse.invalidReason}`);
    }
  } catch (error: any) {
    console.error(`❌ Error during payment verification:`, error.message);
    throw new Error(`Payment verification failed: ${error.message}`);
  }
}

/**
 * Standard payment handler that can be used by all tools
 */
export async function handlePayment(context: any) {
  const { payment, requirements } = context;

  await verifyPayment(payment, requirements);

  return {
    success: true,
    transaction: "",
    network: payment.network,
  };
}
