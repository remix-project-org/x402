import { AccountWallet } from "@ampersend_ai/ampersend-sdk/x402";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

/**
 * Creates a wallet from environment variables
 * Priority: PRIVATE_KEY > SAMPLE_PRIVATE_KEY
 * @returns {AccountWallet} Configured wallet instance
 */
export function createWallet() {
  const privateKey = process.env.PRIVATE_KEY || process.env.SAMPLE_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error("No private key found. Please set PRIVATE_KEY or SAMPLE_PRIVATE_KEY in .env file");
  }

  const wallet = AccountWallet.fromPrivateKey(privateKey);
  console.log(`💼 Wallet address: ${wallet.address}`);
  return wallet;
}
