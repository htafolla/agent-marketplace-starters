# MCP HTTP Next.js Template

An MCP server embedded as a Next.js API route — not a separate process, not a sidecar. The agent lives in your app.

## Why This Pattern

The official MCP examples use standalone Python/Node servers with stdio or SSE transports. That's fine for desktop tools, but for web apps you want:

- **Same deploy** — MCP endpoint ships with your frontend, no separate service
- **Same auth** — Use your existing NextAuth, Clerk, or custom auth session
- **Same database** — MCP tools query your Prisma/Drizzle models directly
- **Type safety** — Shared Zod schemas between your UI and MCP tools

## Architecture

```
Client (Claude/Grok/Cursor) → POST /api/mcp → Next.js API Route → Your Business Logic
```

The API route speaks **MCP Streamable HTTP** (JSON-RPC 2.0 over HTTP POST). This transport is supported by all major MCP clients including Claude, Grok CLI, and Cursor — no SSE or stdio required.

### How It Works

Standard MCP handshake (handled automatically by the route):

```
Client                            Server
  │                                 │
  │ POST /api/mcp (initialize)      │
  │ ───────────────────────────────►│
  │◄─────────────────────────────── │ { protocolVersion, capabilities, serverInfo }
  │                                 │
  │ POST /api/mcp (initialized)     │  ← notification, no id
  │ ───────────────────────────────►│
  │                   202 (no body) │  ← notifications return empty 202
  │                                 │
  │ POST /api/mcp (tools/list)      │
  │ ───────────────────────────────►│
  │◄─────────────────────────────── │ { tools: [...] }
  │                                 │
  │ POST /api/mcp (tools/call)      │
  │ ───────────────────────────────►│
  │◄─────────────────────────────── │ { content: [...] }
```

## Quick Start

```bash
npm install
npm run dev
```

Test the endpoint:

```bash
# List available tools
curl -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Call a tool
curl -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id":2,
    "method":"tools/call",
    "params": {
      "name": "echo",
      "arguments": {"message": "hello world"}
    }
  }'
```

## Grok CLI Configuration

Add to `~/.grok/config.toml`:

```toml
[mcp_servers.my-agent]
url = "https://your-app.vercel.app/api/mcp"
enabled = true
```

The Grok CLI auto-detects Streamable HTTP transport and runs the full MCP handshake: `initialize` → `initialized` (notification) → `tools/list` → `tools/call`.

Verify connectivity:

```bash
grok mcp doctor
```

Expected output:

```
my-agent (http: https://your-app.vercel.app/api/mcp)
  ✓ server started
  ✓ handshake OK (protocol 2024-11-05)
  ✓ 3 tools discovered
```

> **Note on the /sse pattern:** If you previously configured an SSE-based MCP server with a `/sse` suffix, the Grok CLI ignores the path and uses the base URL as the Streamable HTTP endpoint. Remove the `/sse` suffix — the correct URL is just `https://your-app.vercel.app/api/mcp`.

## Adding Tools

1. Define the tool schema in `src/lib/mcp-server.ts`:

```typescript
export const TOOL_DEFINITIONS = [
  {
    name: 'my_tool',
    description: 'What it does',
    inputSchema: {
      type: 'object',
      properties: {
        param: { type: 'string', description: 'Parameter description' }
      },
      required: ['param']
    }
  }
];
```

2. Add the handler:

```typescript
export const TOOL_HANDLERS: Record<string, ToolHandler> = {
  my_tool: async (args) => {
    // Full access to your database, APIs, etc.
    return { result: `You sent: ${args.param}` };
  }
};
```

3. Validate inputs with Zod (optional but recommended):

```typescript
import { z } from 'zod';

const MyToolSchema = z.object({ param: z.string().min(1) });

export const TOOL_HANDLERS = {
  my_tool: async (args) => {
    const validated = MyToolSchema.parse(args);
    return { result: validated.param };
  }
};
```

## Deployment

### Vercel

```bash
vercel --prod
```

The MCP endpoint is available at `https://your-app.vercel.app/api/mcp`.

### Self-hosted

```bash
npm run build
npm start
```

## Testing

```bash
npm test
```

Tests use Vitest and verify JSON-RPC protocol compliance.

## Protocol Details

Implements **MCP Streamable HTTP** transport (JSON-RPC 2.0 over HTTP POST):

### Supported Methods

| Method | Type | Description |
|--------|------|-------------|
| `initialize` | Request | Handshake — returns protocol version, capabilities, server info |
| `ping` | Request | Health check — returns `{}` |
| `tools/list` | Request | Returns available tool definitions |
| `tools/call` | Request | Invokes a tool by name with arguments |
| `initialized` | Notification | Acknowledges handshake (returns 202) |
| `notifications/initialized` | Notification | Alternative notification name (returns 202) |

### Notifications

JSON-RPC requests without an `id` field are treated as notifications per the MCP Streamable HTTP spec. The server responds with **HTTP 202** and an empty body. This is required by Grok CLI and other strict MCP clients.

### Error Codes

| Code | Meaning | HTTP Status |
|------|---------|-------------|
| `-32700` | Parse error | 400 |
| `-32601` | Method/tool not found | 404 |
| `-32602` | Invalid params | 400 |
| `-32603` | Internal error | 500 |
| `-32000` | Rate limit exceeded | 429 |

### Authentication

Pass session token in `Authorization` header (handled by your existing auth middleware).

### Extending

For resources, prompts, or sampling support, add cases to the `switch` statement in `src/app/api/mcp/route.ts`.

## License

MIT
