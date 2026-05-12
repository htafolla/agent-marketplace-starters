/**
 * MCP Server — Business Logic Layer
 * 
 * This file defines tools and their handlers. It's pure TypeScript with no
 * framework dependencies, so it can be tested in isolation.
 * 
 * Architecture:
 * - TOOL_DEFINITIONS: Declarative schemas (what the tool accepts)
 * - TOOL_HANDLERS: Imperative implementations (what the tool does)
 * 
 * Each handler receives validated arguments and returns a ToolResult.
 * Errors are thrown as exceptions and caught by the API route wrapper.
 */

import { z } from "zod";

export type ToolResult = string | Record<string, unknown>;
export type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

/**
 * Tool Definitions — Declarative Schemas
 * 
 * These are returned by the tools/list method. Each definition describes:
 * - name: Machine-readable identifier
 * - description: Human-readable explanation for the LLM
 * - inputSchema: JSON Schema for validation
 */
export const TOOL_DEFINITIONS = [
  {
    name: "echo",
    description: "Echoes back the input message with a timestamp. Useful for testing connectivity.",
    inputSchema: {
      type: "object" as const,
      properties: {
        message: {
          type: "string",
          description: "The message to echo back",
        },
      },
      required: ["message"],
    },
  },
  {
    name: "compute",
    description: "Performs a mathematical computation on two numbers.",
    inputSchema: {
      type: "object" as const,
      properties: {
        a: {
          type: "number",
          description: "First operand",
        },
        b: {
          type: "number",
          description: "Second operand",
        },
        operation: {
          type: "string",
          enum: ["add", "subtract", "multiply", "divide"],
          description: "Mathematical operation to perform",
        },
      },
      required: ["a", "b", "operation"],
    },
  },
  {
    name: "fetch_data",
    description: "Fetches data from an external API endpoint. Demonstrates async I/O in tools.",
    inputSchema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "URL to fetch data from",
        },
      },
      required: ["url"],
    },
  },
];

// Zod schemas for runtime validation (kept in sync with definitions above)
const EchoSchema = z.object({
  message: z.string().min(1),
});

const ComputeSchema = z.object({
  a: z.number(),
  b: z.number(),
  operation: z.enum(["add", "subtract", "multiply", "divide"]),
});

const FetchDataSchema = z.object({
  url: z.string().url(),
});

/**
 * Check if a hostname is a private/internal IP address.
 * Prevents SSRF attacks by blocking access to internal services.
 */
function isPrivateIP(hostname: string): boolean {
  // Check for localhost variations
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
    return true;
  }

  // Check for IPv4 private ranges
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b, c, d] = ipv4Match.map(Number);
    // 10.0.0.0/8
    if (a === 10) return true;
    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.0.0/16
    if (a === 192 && b === 168) return true;
    // 127.0.0.0/8 (loopback)
    if (a === 127) return true;
    // 169.254.0.0/16 (link-local)
    if (a === 169 && b === 254) return true;
    // 0.0.0.0/8
    if (a === 0) return true;
  }

  return false;
}

/**
 * Tool Handlers — Imperative Implementations
 * 
 * Each handler:
 * 1. Validates inputs with Zod (fail fast)
 * 2. Performs the work (DB queries, API calls, computations)
 * 3. Returns a ToolResult (string or object)
 * 
 * Handlers are async and can throw exceptions. The API route catches
 * them and returns JSON-RPC error responses.
 */
// Constants
const FETCH_TIMEOUT_MS = 10_000;

export const TOOL_HANDLERS: Record<string, ToolHandler> = {
  echo: async (args): Promise<ToolResult> => {
    const { message } = EchoSchema.parse(args);
    return {
      message,
      timestamp: new Date().toISOString(),
      length: message.length,
    };
  },

  compute: async (args): Promise<ToolResult> => {
    const { a, b, operation } = ComputeSchema.parse(args);

    let result: number;
    switch (operation) {
      case "add":
        result = a + b;
        break;
      case "subtract":
        result = a - b;
        break;
      case "multiply":
        result = a * b;
        break;
      case "divide":
        if (b === 0) throw new Error("Division by zero");
        result = a / b;
        break;
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }

    return {
      operation,
      operands: { a, b },
      result,
    };
  },

  fetch_data: async (args) => {
    const { url } = FetchDataSchema.parse(args);
    const parsed = new URL(url);

    // Security: Block private/internal addresses to prevent SSRF
    if (isPrivateIP(parsed.hostname)) {
      throw new Error("Access to internal addresses is not allowed");
    }

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error("Failed to fetch data");
    }

    const data = await response.json();
    return {
      url,
      status: response.status,
      data,
    };
  },
};
