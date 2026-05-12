import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { sanitizeError } from "@/lib/logger";

/**
 * Agent Discovery API
 * 
 * Search and filter registered agents with type-safe query parameters.
 */

const DiscoverQuerySchema = z.object({
  search: z.string().optional(),
  capability: z.string().optional(),
  pricingModel: z.enum(["subscription", "per-use", "one-time", "free"]).optional(),
  creatorId: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export async function GET(request: NextRequest) {
  // Rate limit: 60 requests per minute per IP
  const ip = request.headers.get("x-forwarded-for") || request.ip || "unknown";
  const { success: rateLimitOk } = rateLimit(`discover:${ip}`, {
    maxRequests: 60,
    windowMs: 60000,
  });

  if (!rateLimitOk) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again later." },
      { status: 429 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    
    // Parse and validate query params
    const query = DiscoverQuerySchema.safeParse({
      search: searchParams.get("search") || undefined,
      capability: searchParams.get("capability") || undefined,
      pricingModel: searchParams.get("pricingModel") || undefined,
      creatorId: searchParams.get("creatorId") || undefined,
      page: searchParams.get("page") || "1",
      limit: searchParams.get("limit") || "20",
    });

    if (!query.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: query.error.format() },
        { status: 400 }
      );
    }

    const { search, capability, pricingModel, creatorId, page, limit } = query.data;
    const skip = (page - 1) * limit;

    // Build where clause dynamically
    const where: Prisma.AgentWhereInput = {};

    if (creatorId) {
      where.walletAddress = creatorId;
    } else {
      // Only show active agents for public search
      where.status = "ACTIVE";
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    if (capability) {
      where.capabilities = { has: capability };
    }

    if (pricingModel) {
      where.pricing = {
        path: ["model"],
        equals: pricingModel,
      };
    }

    // Fetch agents
    const [agents, total] = await Promise.all([
      prisma.agent.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          description: true,
          mcpEndpoint: true,
          walletAddress: true,
          pricing: true,
          capabilities: true,
          status: true,
          createdAt: true,
        },
      }),
      prisma.agent.count({ where }),
    ]);

    return NextResponse.json({
      agents,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    sanitizeError(error);
    return NextResponse.json(
      { error: "Discovery failed. Please try again later." },
      { status: 500 }
    );
  }
}
