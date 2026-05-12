import { describe, it, expect } from "vitest";
import { TOOL_DEFINITIONS, TOOL_HANDLERS } from "./mcp-server";

describe("MCP Server", () => {
  describe("Tool Definitions", () => {
    it("should have tools defined", () => {
      expect(TOOL_DEFINITIONS.length).toBeGreaterThan(0);
    });

    it("should have handlers for all defined tools", () => {
      for (const tool of TOOL_DEFINITIONS) {
        expect(TOOL_HANDLERS[tool.name]).toBeDefined();
      }
    });
  });

  describe("echo tool", () => {
    it("should echo back the message", async () => {
      const result = await TOOL_HANDLERS["echo"]({ message: "hello" });
      expect(result).toMatchObject({
        message: "hello",
        length: 5,
      });
      expect(result).toHaveProperty("timestamp");
    });

    it("should reject empty messages", async () => {
      await expect(TOOL_HANDLERS["echo"]({ message: "" })).rejects.toThrow();
    });

    it("should reject missing message", async () => {
      await expect(TOOL_HANDLERS["echo"]({})).rejects.toThrow();
    });

    it("should reject non-string message", async () => {
      await expect(TOOL_HANDLERS["echo"]({ message: 123 })).rejects.toThrow();
    });
  });

  describe("compute tool", () => {
    it("should add two numbers", async () => {
      const result = await TOOL_HANDLERS["compute"]({
        a: 5,
        b: 3,
        operation: "add",
      });
      expect(result).toMatchObject({
        operation: "add",
        result: 8,
      });
    });

    it("should subtract two numbers", async () => {
      const result = await TOOL_HANDLERS["compute"]({
        a: 10,
        b: 4,
        operation: "subtract",
      });
      expect(result).toMatchObject({ result: 6 });
    });

    it("should multiply two numbers", async () => {
      const result = await TOOL_HANDLERS["compute"]({
        a: 3,
        b: 4,
        operation: "multiply",
      });
      expect(result).toMatchObject({ result: 12 });
    });

    it("should divide two numbers", async () => {
      const result = await TOOL_HANDLERS["compute"]({
        a: 15,
        b: 3,
        operation: "divide",
      });
      expect(result).toMatchObject({ result: 5 });
    });

    it("should reject division by zero", async () => {
      await expect(
        TOOL_HANDLERS["compute"]({
          a: 10,
          b: 0,
          operation: "divide",
        })
      ).rejects.toThrow("Division by zero");
    });

    it("should reject unknown operation", async () => {
      await expect(
        TOOL_HANDLERS["compute"]({
          a: 1,
          b: 2,
          operation: "power",
        })
      ).rejects.toThrow("Unknown operation");
    });

    it("should reject missing operands", async () => {
      await expect(TOOL_HANDLERS["compute"]({ operation: "add" })).rejects.toThrow();
    });
  });

  describe("fetch_data tool - SSRF protection", () => {
    it("should block localhost", async () => {
      await expect(
        TOOL_HANDLERS["fetch_data"]({ url: "http://localhost:3000/admin" })
      ).rejects.toThrow("Access to internal addresses is not allowed");
    });

    it("should block 127.0.0.1", async () => {
      await expect(
        TOOL_HANDLERS["fetch_data"]({ url: "http://127.0.0.1:8080/api" })
      ).rejects.toThrow("Access to internal addresses is not allowed");
    });

    it("should block private IP 10.x.x.x", async () => {
      await expect(
        TOOL_HANDLERS["fetch_data"]({ url: "http://10.0.0.1/metadata" })
      ).rejects.toThrow("Access to internal addresses is not allowed");
    });

    it("should block private IP 192.168.x.x", async () => {
      await expect(
        TOOL_HANDLERS["fetch_data"]({ url: "http://192.168.1.1/router" })
      ).rejects.toThrow("Access to internal addresses is not allowed");
    });

    it("should block link-local 169.254.x.x", async () => {
      await expect(
        TOOL_HANDLERS["fetch_data"]({ url: "http://169.254.169.254/latest/meta-data/" })
      ).rejects.toThrow("Access to internal addresses is not allowed");
    });

    it("should block 0.0.0.0", async () => {
      await expect(
        TOOL_HANDLERS["fetch_data"]({ url: "http://0.0.0.0:22/" })
      ).rejects.toThrow("Access to internal addresses is not allowed");
    });

    it("should reject invalid URL", async () => {
      await expect(
        TOOL_HANDLERS["fetch_data"]({ url: "not-a-url" })
      ).rejects.toThrow();
    });

    it("should reject missing URL", async () => {
      await expect(TOOL_HANDLERS["fetch_data"]({})).rejects.toThrow();
    });
  });
});
