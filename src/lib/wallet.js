import { AccountWallet } from "@ampersend_ai/ampersend-sdk/x402";

/**
 * Wallet wrapper that uses Ampersand SDK's AccountWallet
 * for creating USDC-compatible EIP-712 signatures (EIP-3009)
 * for the x402 exact scheme
 */
export class Wallet {
  constructor(account) {
    // Use AccountWallet from Ampersand SDK which handles all the EIP-712 signing
    this.wallet = new AccountWallet(account);
    this.address = account.address;
  }

  /**
   * Creates a payment payload with correct USDC EIP-712 signature
   * Delegates to AccountWallet from Ampersand SDK
   */
  async createPayment(requirements) {
    return await this.wallet.createPayment(requirements);
  }
}
