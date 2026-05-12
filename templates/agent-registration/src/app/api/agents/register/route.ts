import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { recoverMessageAddress } from "viem";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { logger, sanitizeError } from "@/lib/logger";

/**
 * Agent Registration — Crypto-Verified Ownership
 * 
 * Architecture Decision:
 * We use wallet signatures instead of OAuth/email because:
 * 1. Agents are crypto-native — they receive payments on-chain
 * 2. Wallet address is the universal identity in Web3
 * 3. No password management, no email verification
 * 4. Signature proof is non-repudiable
 * 
 * Headers:
 * - x-wallet-address: The EVM address registering the agent
 * - x-wallet-message: The message that was signed (format: "Register agent {name}")
 * - x-wallet-signature: The ECDSA signature
 */

const RegisterAgentSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(10).max(2000),
  mcpEndpoint: z.string().url(),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  solanaWalletAddress: z.string().optional(),
  suiWalletAddress: z.string().optional(),
  nearWalletAddress: z.string().optional(),
  pricing: z.object({
    model: z.enum(["subscription", "per-use", "one-time", "free"]),
    amount: z.number().min(0),
    currency: z.string().default("USD"),
  }),
  capabilities: z.array(z.string()).default([]),
});

export async function POST(request: NextRequest) {
  // Rate limit: 5 registrations per hour per IP
  const ip = request.headers.get("x-forwarded-for") || request.ip || "unknown";
  const { success: rateLimitOk } = rateLimit(`register:${ip}`, {
    maxRequests: 5,
    windowMs: 3600000,
  });

  if (!rateLimitOk) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again later." },
      { status: 429 }
    );
  }

  try {
    // Extract and validate verification headers
    const HeaderSchema = z.object({
      address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
      message: z.string().min(1),
      signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/), // ECDSA signature length
    });

    const walletAddress = request.headers.get("x-wallet-address");
    const walletMessage = request.headers.get("x-wallet-message");
    const walletSignature = request.headers.get("x-wallet-signature");

    const headerValidation = HeaderSchema.safeParse({
      address: walletAddress,
      message: walletMessage,
      signature: walletSignature,
    });

    if (!headerValidation.success) {
      return NextResponse.json(
        { error: "Missing or invalid verification headers" },
        { status: 401 }
      );
    }

    // Verify signature
    try {
      const recoveredAddress = await recoverMessageAddress({
        message: headerValidation.data.message,
        signature: headerValidation.data.signature as `0x${string}`,
      });

      if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
        return NextResponse.json(
          { error: "Invalid signature: recovered address does not match claimed address" },
          { status: 403 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: "Signature verification failed" },
        { status: 403 }
      );
    }

    // Parse and validate body
    const body = await request.json();
    const parsed = RegisterAgentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid agent data", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Use provided wallet address or fall back to header
    const ownerAddress = data.walletAddress || walletAddress;

    // Check for duplicate MCP endpoint
    const existing = await prisma.agent.findUnique({
      where: { mcpEndpoint: data.mcpEndpoint },
    });

    if (existing) {
      return NextResponse.json(
        { error: "An agent with this MCP endpoint already exists" },
        { status: 409 }
      );
    }

    // Verify MCP endpoint is reachable
    try {
      const mcpResponse = await fetch(data.mcpEndpoint, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      if (!mcpResponse.ok) {
        logger.warn("MCP endpoint returned non-OK status", { status: mcpResponse.status, endpoint: data.mcpEndpoint });
      }
    } catch {
      logger.warn("MCP endpoint unreachable", { endpoint: data.mcpEndpoint });
      // Don't block registration for connectivity issues
    }

    // Create agent within transaction for atomicity
    const agent = await prisma.$transaction(async (tx) => {
      const created = await tx.agent.create({
        data: {
          name: data.name,
          description: data.description,
          mcpEndpoint: data.mcpEndpoint,
          walletAddress: ownerAddress,
          solanaWalletAddress: data.solanaWalletAddress,
          suiWalletAddress: data.suiWalletAddress,
          nearWalletAddress: data.nearWalletAddress,
          pricing: data.pricing,
          capabilities: data.capabilities,
          status: "ACTIVE",
        },
      });
      return created;
    });

    return NextResponse.json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        mcpEndpoint: agent.mcpEndpoint,
      },
    });
  } catch (error) {
    sanitizeError(error);
    return NextResponse.json(
      { error: "Registration failed. Please try again later." },
      { status: 500 }
    );
  }
}
