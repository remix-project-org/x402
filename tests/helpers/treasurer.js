import { settle } from "x402/facilitator";
import { createSigner } from "x402/types";
import dotenv from "dotenv";

dotenv.config();

/**
 * Treasurer that auto-approves and IMMEDIATELY settles payments on-chain
 */
export class Treasurer {
  constructor(wallet) {
    this.wallet = wallet;
    this.lastPayment = null;
    this.lastRequirements = null;
    this.lastSettlement = null;
  }

  async onPaymentRequired(requirements, _context) {
    if (requirements.length === 0) return null;
    // Use our custom USDCWallet to create payment with correct signature
    const payment = await this.wallet.createPayment(requirements[0]);

    // Store payment details
    this.lastPayment = payment;
    this.lastRequirements = requirements[0];

    // IMMEDIATELY settle payment on-chain (client pays gas)
    console.log("\n⛓️  Settling payment on-chain (client pays gas)...");
    try {
      const privateKey = process.env.PRIVATE_KEY || process.env.SAMPLE_PRIVATE_KEY;
      if (!privateKey) {
        throw new Error("PRIVATE_KEY not found in environment");
      }

      // Create signer for settlement
      const signer = await createSigner(requirements[0].network, privateKey);

      // Settle the payment on-chain (client executes the transfer)
      const settleResponse = await settle(signer, payment, requirements[0]);

      if (settleResponse.success) {
        this.lastSettlement = settleResponse;
      } else {
        console.error(`❌ Settlement failed: ${settleResponse.errorReason}`);
        throw new Error(`On-chain settlement failed: ${settleResponse.errorReason}`);
      }
    } catch (error) {
      console.error(`❌ Error settling payment:`, error.message);
      throw new Error(`Payment settlement required but failed: ${error.message}`);
    }

    return {
      payment,
      authorizationId: crypto.randomUUID(),
    };
  }

  async onStatus(status, _authorization) {
    console.log(`[Payment] ${status}`);
  }

  // Get the last payment and settlement details
  getLastPaymentDetails() {
    return {
      payment: this.lastPayment,
      requirements: this.lastRequirements,
      settlement: this.lastSettlement,
    };
  }
}
