import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { logger, sanitizeError } from "@/lib/logger";

/**
 * x402 Webhook Handler
 * 
 * Receives settlement confirmations from the x402 facilitator.
 * Updates transaction status in your database.
 */

export async function POST(request: NextRequest) {
  // Rate limit: 100 webhooks per minute per IP
  const ip = request.headers.get("x-forwarded-for") || request.ip || "unknown";
  const { success: rateLimitOk } = rateLimit(`webhook:${ip}`, {
    maxRequests: 100,
    windowMs: 60000,
  });

  if (!rateLimitOk) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429 }
    );
  }

  try {
    // Verify webhook authenticity
    const webhookSecret = request.headers.get("x-webhook-secret");
    if (webhookSecret !== process.env.X402_WEBHOOK_SECRET) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

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
    logger.info("x402 settlement received", {
      txHash,
      status,
      chain,
      amount,
      recipient,
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    sanitizeError(error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
