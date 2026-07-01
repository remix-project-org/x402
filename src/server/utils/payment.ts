import { verify } from "x402/facilitator";
import { createConnectedClient } from "x402/types";
import { getActiveNetwork } from "../config/network.js";

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
 * Create payment requirements for a tool
 */
export function createPaymentRequirements(
  resource: string,
  amount: string,
  description: string
) {
  const network = getActiveNetwork();
  const payToAddress = validatePayToAddress(process.env.PAY_TO_ADDRESS);

  return {
    scheme: "exact" as const,
    description,
    network: network.name as any,
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
