import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { TOOL_DEFINITIONS, TOOL_HANDLERS, type ToolResult } from "@/lib/mcp-server";
import { rateLimit } from "@/lib/rate-limit";
import { sanitizeError, generateRequestId } from "@/lib/logger";

// JSON-RPC 2.0 request schema
const JsonRpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string(),
  params: z.record(z.unknown()).optional(),
});

/**
 * MCP HTTP Endpoint — Embedded in Next.js API Route
 * 
 * Architecture Decision:
 * We use HTTP transport instead of stdio/SSE because:
 * 1. Next.js API routes are HTTP-native
 * 2. No separate process to manage
 * 3. Auth middleware works out of the box
 * 4. Deploys with the same `vercel --prod`
 * 
 * Protocol: JSON-RPC 2.0 over HTTP POST
 * Methods: tools/list, tools/call
 */
export async function POST(request: NextRequest) {
  const requestId = generateRequestId();

  // Rate limit: 30 requests per minute per IP
  const ip = request.headers.get("x-forwarded-for") || request.ip || "unknown";
  const { success: rateLimitOk } = rateLimit(`mcp:${ip}`, {
    maxRequests: 30,
    windowMs: 60000,
  });

  if (!rateLimitOk) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32000, message: "Rate limit exceeded" } },
      { status: 429, headers: { "X-Request-Id": requestId } }
    );
  }

  try {
    const body = await request.json();
    const parsed = JsonRpcRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id: body?.id ?? null,
          error: {
            code: -32700,
            message: "Parse error: Invalid JSON-RPC 2.0 request",
            data: parsed.error.format(),
          },
        },
        { status: 400, headers: { "X-Request-Id": requestId } }
      );
    }

    const { id, method, params } = parsed.data;

    switch (method) {
      case "tools/list": {
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            tools: TOOL_DEFINITIONS,
          },
        });
      }

      case "tools/call": {
        const callParams = z
          .object({
            name: z.string(),
            arguments: z.record(z.unknown()).default({}),
          })
          .safeParse(params);

        if (!callParams.success) {
          return NextResponse.json(
            {
              jsonrpc: "2.0",
              id,
              error: {
                code: -32602,
                message: "Invalid params: Expected { name: string, arguments: object }",
                data: callParams.error.format(),
              },
        },
        { status: 400, headers: { "X-Request-Id": requestId } }
      );
    }

    const { name, arguments: args } = callParams.data;
    const handler = TOOL_HANDLERS[name];

    if (!handler) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id,
          error: {
            code: -32601,
            message: `Tool not found: ${name}`,
          },
        },
        { status: 404, headers: { "X-Request-Id": requestId } }
      );
    }

    try {
      const result: ToolResult = await handler(args);
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: typeof result === "string" ? result : JSON.stringify(result),
            },
          ],
        },
      }, { headers: { "X-Request-Id": requestId } });
    } catch (error) {
      sanitizeError(error);
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id,
          error: {
            code: -32603,
            message: "Tool execution failed",
          },
        },
        { status: 500, headers: { "X-Request-Id": requestId } }
      );
    }
  }

  default: {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id,
        error: {
          code: -32601,
          message: `Method not found: ${method}`,
        },
      },
      { status: 404, headers: { "X-Request-Id": requestId } }
    );
  }
}
} catch (error) {
sanitizeError(error);
return NextResponse.json(
  {
    jsonrpc: "2.0",
    id: null,
    error: {
      code: -32603,
      message: "Internal error",
    },
  },
  { status: 500, headers: { "X-Request-Id": requestId } }
);
}
}

/**
 * GET handler for simple health checks and discovery
 * Returns the list of available tools without JSON-RPC wrapper
 */
export async function GET() {
  return NextResponse.json({
    protocol: "mcp",
    version: "0.1.0",
    transport: "http",
    tools: TOOL_DEFINITIONS.map((t) => t.name),
  });
}
