import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";

/**
 * Custom wallet that creates USDC-compatible EIP-712 signatures
 * for the x402 exact scheme
 */
export class USDCWallet {
  constructor(account) {
    this.account = account;
    this.address = account.address;
  }

  /**
   * Creates a payment payload with correct USDC EIP-712 signature
   */
  async createPayment(requirements) {
    if (requirements.scheme !== "exact") {
      throw new Error(`Unsupported scheme: ${requirements.scheme}`);
    }

    // Get USDC contract info
    const usdcAddress = requirements.asset;

    // Create public client to read USDC contract
    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http("https://sepolia.base.org"),
    });

    // Read USDC contract name and version for EIP-712 domain
    const usdcAbi = [
      {
        inputs: [],
        name: "name",
        outputs: [{ internalType: "string", name: "", type: "string" }],
        stateMutability: "view",
        type: "function",
      },
      {
        inputs: [],
        name: "version",
        outputs: [{ internalType: "string", name: "", type: "string" }],
        stateMutability: "pure",
        type: "function",
      },
    ];

    const [name, version] = await Promise.all([
      publicClient.readContract({
        address: usdcAddress,
        abi: usdcAbi,
        functionName: "name",
      }),
      publicClient.readContract({
        address: usdcAddress,
        abi: usdcAbi,
        functionName: "version",
      }),
    ]);

    // Generate nonce (random bytes32)
    const nonce = `0x${Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")}`;

    // Calculate validAfter and validBefore (current time +/- buffer)
    const now = Math.floor(Date.now() / 1000);
    const validAfter = now - 60; // Valid from 1 min ago
    const validBefore = now + requirements.maxTimeoutSeconds;

    // Create authorization message
    const authorization = {
      from: this.account.address,
      to: requirements.payTo,
      value: requirements.maxAmountRequired,
      validAfter: validAfter.toString(),
      validBefore: validBefore.toString(),
      nonce: nonce,
    };

    // USDC EIP-712 domain
    const domain = {
      name: name,
      version: version,
      chainId: baseSepolia.id,
      verifyingContract: usdcAddress,
    };

    // TransferWithAuthorization type (EIP-3009)
    const types = {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    };

    // Sign the message using the account's sign method
    const signature = await this.account.signTypedData({
      domain,
      types,
      primaryType: "TransferWithAuthorization",
      message: authorization,
    });

    // Return payment payload in x402 format
    return {
      x402Version: 1,
      scheme: "exact",
      network: requirements.network,
      payload: {
        signature: signature,
        authorization: authorization,
      },
    };
  }
}
