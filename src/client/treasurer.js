/**
 * Simple treasurer that auto-approves all payment requests
 */
export class NaiveTreasurer {
  constructor(wallet) {
    this.wallet = wallet;
  }

  async onPaymentRequired(requirements, _context) {
    if (requirements.length === 0) return null;

    console.log("💰 Payment required:");
    console.log(`   Amount: ${requirements[0].maxAmountRequired}`);

    const payment = await this.wallet.createPayment(requirements[0]);
    return {
      payment,
      authorizationId: crypto.randomUUID(),
    };
  }

  async onStatus(status, _authorization) {
    console.log(`[Payment] ${status}`);
  }
}
