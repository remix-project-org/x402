import dotenv from "dotenv";

dotenv.config();

/**
 * Naive Treasurer that only approves payments without settling them on-chain.
 * This version simply creates payment authorization and returns it.
 */
export class NaiveTreasurer {
  constructor(wallet) {
    this.wallet = wallet;
  }

  async onPaymentRequired(requirements, _context) {
    if (requirements.length === 0) return null;

    console.log("💰 Payment required:");
    console.log(`   Amount: ${requirements[0].maxAmountRequired}`);

    // Use wallet to create payment authorization
    const payment = await this.wallet.createPayment(requirements[0]);

    console.log("\n💳 Payment authorization created");
    console.log("   Payment object:", JSON.stringify(payment, null, 2));

    return {
      payment,
      authorizationId: crypto.randomUUID(),
    };
  }

  async onStatus(status, _authorization) {
    console.log(`[Payment] ${status}`);
  }
}
