# UI Manifest Template

Declarative agent UI system. Agents describe their interface; the marketplace renders it automatically.

## What It Solves

Without UI manifests:
- Each agent needs a custom frontend
- Marketplace can't render agent interfaces generically
- Agent creators must write React code

With UI manifests:
- Agent declares: "I need a URL input and a submit button"
- Marketplace renders a form automatically
- No custom frontend code needed

## Architecture

```
Agent Creator → Writes UI Manifest (JSON)
                      ↓
              Marketplace reads manifest
                      ↓
              Renders form/chat/wizard UI
                      ↓
              User interacts → calls MCP tools
```

## Manifest Schema

```typescript
interface UiManifest {
  version: "1.0";
  displayMode: "form" | "chat" | "wizard" | "viewer";
  fields: Field[];
  resultFormat: "markdown" | "structured" | "file";
}

interface Field {
  name: string;
  type: "text" | "textarea" | "url" | "number" | "select" | "multiselect" | "toggle";
  label: string;
  description?: string;
  required?: boolean;
  validation?: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    min?: number;
    max?: number;
  };
  options?: string[]; // For select/multiselect
  conditional?: {
    field: string;
    value: string | boolean;
  };
}
```

## Quick Start

```bash
npm install
npm run dev
```

## Example Manifest

```json
{
  "version": "1.0",
  "displayMode": "form",
  "fields": [
    {
      "name": "url",
      "type": "url",
      "label": "Website URL",
      "description": "Enter the URL to analyze",
      "required": true,
      "validation": {
        "pattern": "^https?://"
      }
    },
    {
      "name": "depth",
      "type": "select",
      "label": "Analysis Depth",
      "options": ["quick", "standard", "deep"],
      "default": "standard"
    }
  ],
  "resultFormat": "markdown"
}
```

## Auto-Mapping to MCP Tools

The renderer can automatically map form fields to MCP tool arguments:

```typescript
// Manifest field "url" → MCP tool argument "targetUrl"
const mapping = inferFieldToolMapping(manifest, mcpTools);
// Returns: { url: "targetUrl", depth: "scanDepth" }
```

## Renderer Components

- `FormRenderer` — Renders fields as a form with validation
- `ChatRenderer` — Single text input with streaming output
- `WizardRenderer` — Multi-step form with progress indicator
- `ViewerRenderer` — Display-only (for results/dashboards)

## Usage

```tsx
import { ManifestRenderer } from '@/components/ManifestRenderer';

export default function AgentPage({ manifest }) {
  return (
    <ManifestRenderer
      manifest={manifest}
      onSubmit={async (values) => {
        // Map values to MCP tool arguments
        const result = await callMcpTool('analyze', values);
        return result;
      }}
    />
  );
}
```

## License

MIT
