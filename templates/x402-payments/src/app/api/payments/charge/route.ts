import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/**
 * Payment Charge API — 402 Response Handler
 * 
 * Returns payment requirements for agent usage.
 * The client receives this 402, signs a payment, and retries with proof.
 */

const ChargeSchema = z.object({
  agentId: z.string(),
  amount: z.number().min(0),
  currency: z.string().default("USD"),
  chain: z.enum(["base", "solana", "sui", "near"]).default("base"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = ChargeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid charge request", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { agentId, amount, currency, chain } = parsed.data;

    // In production, look up agent's wallet address from database
    const recipientAddress = getAgentWalletAddress(agentId, chain);

    if (!recipientAddress) {
      return NextResponse.json(
        { error: "Agent wallet address not configured" },
        { status: 400 }
      );
    }

    // Return 402 with payment requirements
    return NextResponse.json(
      {
        error: "Payment Required",
        paymentRequirements: {
          scheme: "exact",
          network: chain,
          maxAmountRequired: Math.floor(amount * 1_000_000).toString(), // Convert to base units
          asset: getAssetAddress(chain),
          payTo: recipientAddress,
          resource: request.url,
          description: `Payment for agent ${agentId}`,
          maxTimeoutSeconds: 300,
        },
      },
      { status: 402 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Charge failed: ${message}` },
      { status: 500 }
    );
  }
}

// Helper: Get agent wallet address (stub — implement with your DB)
function getAgentWalletAddress(agentId: string, chain: string): string | null {
  // In production: query your database
  // return prisma.agent.findUnique({ where: { id: agentId } })?.walletAddress;
  
  // Stub for demonstration
  const addresses: Record<string, string> = {
    "agent-123": "0x1234567890123456789012345678901234567890",
  };
  return addresses[agentId] || null;
}

// Helper: Get USDC contract address per chain
function getAssetAddress(chain: string): string {
  const addresses: Record<string, string> = {
    base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    solana: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    near: "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
    sui: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
  };
  return addresses[chain] || addresses.base;
}
