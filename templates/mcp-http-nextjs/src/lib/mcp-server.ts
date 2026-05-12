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
export const TOOL_HANDLERS: Record<string, ToolHandler> = {
  echo: async (args) => {
    const { message } = EchoSchema.parse(args);
    return {
      message,
      timestamp: new Date().toISOString(),
      length: message.length,
    };
  },

  compute: async (args) => {
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
    }

    return {
      operation,
      operands: { a, b },
      result,
    };
  },

  fetch_data: async (args) => {
    const { url } = FetchDataSchema.parse(args);

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      url,
      status: response.status,
      data,
    };
  },
};
