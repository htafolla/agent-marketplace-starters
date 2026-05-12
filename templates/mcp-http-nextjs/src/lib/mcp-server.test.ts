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

    it("should reject division by zero", async () => {
      await expect(
        TOOL_HANDLERS["compute"]({
          a: 10,
          b: 0,
          operation: "divide",
        })
      ).rejects.toThrow("Division by zero");
    });
  });
});
