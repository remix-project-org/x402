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
 * Sleep helper for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Verify payment has been settled on-chain with retry logic
 */
export async function verifyPayment(payment: any, requirements: any): Promise<void> {
  console.log(`💰 Received payment authorization`);
  console.log(`   From: ${payment.payload?.authorization?.from || 'unknown'}`);
  console.log(`   To: ${payment.payload?.authorization?.to || 'unknown'}`);
  console.log(`   Amount: ${payment.payload?.authorization?.value || '0'} USDC`);
  console.log(`   Network: ${payment.network}`);

  console.log(`\n⛓️  Verifying payment settlement on-chain...`);

  const MAX_RETRIES = 2;
  const INITIAL_DELAY_MS = 2000; // Start with 2 seconds
  let lastError: any = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const client = createConnectedClient(requirements.network);

      if (attempt > 1) {
        console.log(`   Retry attempt ${attempt}/${MAX_RETRIES}...`);
      } else {
        console.log("   Payment object received:", JSON.stringify(payment, null, 2));
      }

      const verifyResponse = await verify(client, payment, requirements);

      if (verifyResponse.isValid) {
        console.log(`✅ Payment verified as settled on-chain!`);
        if (attempt > 1) {
          console.log(`   Verified on attempt ${attempt}/${MAX_RETRIES}`);
        }
        console.log(`   Client settled and paid gas fees`);
        console.log(`   Server received USDC payment`);
        return; // Success!
      } else {
        lastError = new Error(`Payment not settled on-chain: ${verifyResponse.invalidReason}`);
        console.log(`   ⚠️  Verification attempt ${attempt} failed: ${verifyResponse.invalidReason}`);

        if (attempt < MAX_RETRIES) {
          const delayMs = INITIAL_DELAY_MS * Math.pow(2, attempt - 1); // Exponential backoff: 1s, 2s, 4s
          console.log(`   Waiting ${delayMs}ms before retry...`);
          await sleep(delayMs);
        }
      }
    } catch (error: any) {
      lastError = error;
      console.error(`   ⚠️  Verification attempt ${attempt} error: ${error.message}`);

      if (attempt < MAX_RETRIES) {
        const delayMs = INITIAL_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(`   Waiting ${delayMs}ms before retry...`);
        await sleep(delayMs);
      }
    }
  }

  // All retries exhausted
  console.error(`❌ Payment verification failed after ${MAX_RETRIES} attempts`);
  throw new Error(`Payment verification failed after ${MAX_RETRIES} retries: ${lastError?.message || 'Unknown error'}`);
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
