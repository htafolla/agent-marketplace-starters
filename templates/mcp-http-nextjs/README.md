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

The API route speaks JSON-RPC 2.0 over HTTP. Tools are defined declaratively with Zod schemas. Handlers are plain async functions with full access to your app's infrastructure.

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

This implements a subset of MCP over HTTP:

- `POST /api/mcp` — JSON-RPC 2.0 endpoint
- Methods: `tools/list`, `tools/call`
- Authentication: Pass session token in `Authorization` header (handled by your existing auth)

For full MCP spec compliance (resources, prompts, sampling), extend the method switch in `route.ts`.

## License

MIT
