import { describe, it, expect } from "vitest";
import { POST, GET } from "./route";

describe("MCP API Route", () => {
  describe("POST /api/mcp", () => {
    it("should list tools", async () => {
      const request = new Request("http://localhost:3000/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.jsonrpc).toBe("2.0");
      expect(data.id).toBe(1);
      expect(data.result.tools).toBeDefined();
      expect(data.result.tools.length).toBeGreaterThan(0);
      expect(response.headers.get("X-Request-Id")).toBeDefined();
    });

    it("should call a tool", async () => {
      const request = new Request("http://localhost:3000/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "echo",
            arguments: { message: "test" },
          },
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.jsonrpc).toBe("2.0");
      expect(data.id).toBe(2);
      expect(data.result.content[0].text).toContain("test");
    });

    it("should return error for unknown tool", async () => {
      const request = new Request("http://localhost:3000/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: {
            name: "nonexistent",
            arguments: {},
          },
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.error.code).toBe(-32601);
      expect(response.status).toBe(404);
      expect(data.error.message).toBe("Tool not found: nonexistent");
    });

    it("should return error for invalid JSON-RPC", async () => {
      const request = new Request("http://localhost:3000/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invalid: true }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.error.code).toBe(-32700);
      expect(response.status).toBe(400);
    });

    it("should return error for unknown method", async () => {
      const request = new Request("http://localhost:3000/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 4,
          method: "unknown/method",
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.error.code).toBe(-32601);
      expect(response.status).toBe(404);
    });

    it("should return error for missing tool params", async () => {
      const request = new Request("http://localhost:3000/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 5,
          method: "tools/call",
          params: {},
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.error.code).toBe(-32602);
      expect(response.status).toBe(400);
    });

    it("should return sanitized error for tool execution failure", async () => {
      const request = new Request("http://localhost:3000/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 6,
          method: "tools/call",
          params: {
            name: "compute",
            arguments: { a: 10, b: 0, operation: "divide" },
          },
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.error.code).toBe(-32603);
      expect(data.error.message).toBe("Tool execution failed");
      expect(response.status).toBe(500);
    });

    it("should include X-Request-Id header in error responses", async () => {
      const request = new Request("http://localhost:3000/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invalid: true }),
      });

      const response = await POST(request);
      expect(response.headers.get("X-Request-Id")).toBeTruthy();
    });
  });

  describe("GET /api/mcp", () => {
    it("should return health info", async () => {
      const response = await GET();
      const data = await response.json();

      expect(data.protocol).toBe("mcp");
      expect(data.tools).toBeDefined();
      expect(Array.isArray(data.tools)).toBe(true);
    });
  });
});
