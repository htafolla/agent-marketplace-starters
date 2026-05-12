import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { recoverMessageAddress } from "viem";
import { prisma } from "@/lib/db";

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
  try {
    // Extract verification headers
    const walletAddress = request.headers.get("x-wallet-address");
    const walletMessage = request.headers.get("x-wallet-message");
    const walletSignature = request.headers.get("x-wallet-signature");

    if (!walletAddress || !walletMessage || !walletSignature) {
      return NextResponse.json(
        { error: "Missing verification headers: x-wallet-address, x-wallet-message, x-wallet-signature" },
        { status: 401 }
      );
    }

    // Verify signature
    try {
      const recoveredAddress = await recoverMessageAddress({
        message: walletMessage,
        signature: walletSignature as `0x${string}`,
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
        console.warn(`MCP endpoint returned ${mcpResponse.status}: ${data.mcpEndpoint}`);
      }
    } catch {
      console.warn(`MCP endpoint unreachable: ${data.mcpEndpoint}`);
      // Don't block registration for connectivity issues
    }

    // Create agent
    const agent = await prisma.agent.create({
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

    return NextResponse.json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        mcpEndpoint: agent.mcpEndpoint,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Registration failed: ${message}` },
      { status: 500 }
    );
  }
}
