import { z } from "zod";

/**
 * UI Manifest Schema — Declarative Agent Interface
 * 
 * Agents describe their UI needs with this schema. The marketplace renders
 * the appropriate interface without custom frontend code.
 * 
 * Design Principles:
 * 1. Constraint-based — specify what you need, not how to render it
 * 2. Type-safe — Zod schema validates at runtime and infers TypeScript types
 * 3. Progressive — simple cases are simple, complex cases are possible
 * 4. Tool-aware — fields can auto-map to MCP tool input schemas
 */

export const ValidationSchema = z.object({
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
  pattern: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
});

export const ConditionalSchema = z.object({
  field: z.string(),
  value: z.union([z.string(), z.boolean()]),
});

export const FieldSchema = z.object({
  name: z.string().min(1),
  type: z.enum([
    "text",
    "textarea",
    "url",
    "number",
    "select",
    "multiselect",
    "toggle",
    "readonly",
  ]),
  label: z.string().min(1),
  description: z.string().optional(),
  required: z.boolean().default(false),
  default: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).optional(),
  validation: ValidationSchema.optional(),
  options: z.array(z.string()).optional(), // For select/multiselect
  conditional: ConditionalSchema.optional(),
});

export const UiManifestSchema = z.object({
  version: z.literal("1.0"),
  displayMode: z.enum(["form", "chat", "wizard", "viewer"]),
  fields: z.array(FieldSchema).min(1),
  resultFormat: z.enum(["markdown", "structured", "file"]).default("markdown"),
  title: z.string().optional(),
  description: z.string().optional(),
});

export type UiManifest = z.infer<typeof UiManifestSchema>;
export type Field = z.infer<typeof FieldSchema>;
export type Validation = z.infer<typeof ValidationSchema>;

/**
 * Infer field-to-tool mappings from manifest and MCP tool schemas
 * 
 * Uses fuzzy matching on field names and descriptions to suggest
 * which manifest field maps to which MCP tool argument.
 */
export function inferFieldToolMapping(
  manifest: UiManifest,
  mcpTools: Array<{ name: string; inputSchema?: { properties?: Record<string, { description?: string }> } }>
): Record<string, string> {
  const mapping: Record<string, string> = {};

  for (const field of manifest.fields) {
    // Simple heuristic: match field name to tool argument name
    for (const tool of mcpTools) {
      if (!tool.inputSchema?.properties) continue;

      for (const [argName, argSchema] of Object.entries(tool.inputSchema.properties)) {
        if (
          field.name.toLowerCase() === argName.toLowerCase() ||
          field.name.toLowerCase().includes(argName.toLowerCase()) ||
          argName.toLowerCase().includes(field.name.toLowerCase()) ||
          (field.description &&
            argSchema.description &&
            field.description.toLowerCase().includes(argSchema.description.toLowerCase().split(" ")[0]))
        ) {
          mapping[field.name] = argName;
          break;
        }
      }
    }
  }

  return mapping;
}
