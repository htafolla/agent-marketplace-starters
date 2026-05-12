import { NextRequest, NextResponse } from "next/server";

/**
 * x402 Webhook Handler
 * 
 * Receives settlement confirmations from the x402 facilitator.
 * Updates transaction status in your database.
 */

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();

    // Validate webhook payload
    if (!payload.txHash || !payload.status) {
      return NextResponse.json(
        { error: "Invalid webhook payload" },
        { status: 400 }
      );
    }

    const { txHash, status, chain, amount, recipient } = payload;

    // Update transaction record
    // In production: await prisma.transaction.update({...})
    console.log("x402 settlement:", {
      txHash,
      status,
      chain,
      amount,
      recipient,
      settledAt: new Date().toISOString(),
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Webhook failed: ${message}` },
      { status: 500 }
    );
  }
}
