# Architecture Guide

How these templates fit together and why we made the decisions we did.

## The Problem with Existing Resources

The MCP ecosystem has excellent **tutorials** but few **production patterns**:

| Resource | Teaches You | Doesn't Teach You |
|----------|------------|-------------------|
| MCP Quickstart | How to build a stdio server | How to embed in a web app |
| Official Servers | How to expose filesystem/search tools | How to charge for usage |
| SDK Docs | How to speak MCP protocol | How to verify agent ownership |

These templates bridge that gap.

## Template Relationships

```
┌─────────────────────────────────────────────────────────────┐
│                      Marketplace (Your App)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Agent A    │  │   Agent B    │  │   Agent C    │      │
│  │  (External)  │  │  (External)  │  │  (External)  │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                  │                  │              │
│         └──────────────────┼──────────────────┘              │
│                            │                                 │
│                    ┌───────┴───────┐                        │
│                    │  MCP Client   │  ← agent-registration   │
│                    │    Proxy      │                         │
│                    └───────┬───────┘                         │
│                            │                                 │
│  ┌─────────────────────────┼─────────────────────────────┐  │
│  │                         │                             │  │
│  │  ┌──────────────────────┴──────────────────────┐     │  │
│  │  │         Your Next.js Application             │     │  │
│  │  │                                              │     │  │
│  │  │  ┌─────────────┐      ┌─────────────────┐   │     │  │
│  │  │  │  /api/mcp   │      │  /api/agents    │   │     │  │
│  │  │  │  (in-proc)  │      │  (register)     │   │     │  │
│  │  │  └─────────────┘      └─────────────────┘   │     │  │
│  │  │                                              │     │  │
│  │  │  ┌─────────────┐      ┌─────────────────┐   │     │  │
│  │  │  │ /payments   │      │  UI Manifest    │   │     │  │
│  │  │  │ (x402)      │      │  (renderer)     │   │     │  │
│  │  │  └─────────────┘      └─────────────────┘   │     │  │
│  │  │                                              │     │  │
│  │  └──────────────────────────────────────────────┘     │  │
│  └────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Key Decisions

### 1. In-Process MCP (mcp-http-nextjs)

**Decision**: MCP endpoint as a Next.js API route, not a separate server.

**Why**:
- Deploys with the same `vercel --prod` command
- Shares auth sessions, database connections, and middleware
- No process management or inter-service communication
- TypeScript types flow from your business logic to the API boundary

**Tradeoff**: Single point of failure (if the app is down, MCP is down). Mitigation: serverless deploys mean fast cold starts and automatic scaling.

### 2. Wallet-Native Identity (agent-registration)

**Decision**: Cryptographic wallet signatures instead of OAuth/email.

**Why**:
- Agents receive payments on-chain — wallet address IS the payout destination
- No password reset flow, no email verification
- Signature is non-repudiable proof of ownership
- Works with hardware wallets, smart contract wallets, any EVM signer

**Tradeoff**: Users must have a wallet. Mitigation: Support embedded wallets (Privy, Magic, etc.) that abstract key management.

### 3. Protocol-Level Payments (x402-payments)

**Decision**: x402 protocol (402 status code + payment headers) instead of Stripe checkout.

**Why**:
- Payment happens IN the request flow, not a separate redirect
- Supports any chain (Base, Solana, Sui, NEAR)
- No webhook infrastructure needed
- Users stay in your app throughout

**Tradeoff**: Requires wallet connection. Mitigation: Support both — x402 for web3 users, Stripe for others.

### 4. Declarative UI (ui-manifest)

**Decision**: Agents describe their UI with JSON, marketplace renders it.

**Why**:
- Agent creators don't write frontend code
- Marketplace can render any agent consistently
- Changes to agent inputs don't require marketplace redeploy
- Form validation, tool mapping, and result rendering are automatic

**Tradeoff**: Less flexibility than custom React components. Mitigation: Support custom components for power users.

## Integration Order

If you're building a marketplace from scratch, integrate in this order:

1. **mcp-http-nextjs** — Get your first MCP endpoint working
2. **agent-registration** — Let creators register agents
3. **ui-manifest** — Render agent interfaces automatically
4. **x402-payments** — Charge for usage

Each template is standalone. You can use just one or combine all four.

## Security Considerations

- **Signature verification**: Always verify wallet signatures server-side (never trust client)
- **Payment replay protection**: Track settled transaction hashes to prevent double-spending
- **MCP sandboxing**: External agent endpoints are untrusted — validate all responses
- **Rate limiting**: Protect registration and payment endpoints from spam

## Performance Considerations

- **MCP cold starts**: Serverless functions have cold starts. Keep MCP endpoints stateless.
- **Payment verification**: Use fast RPC endpoints (Alchemy, Infura) for receipt checks.
- **Database**: Index `walletAddress`, `mcpEndpoint`, and `status` columns.
- **Caching**: Cache agent discovery results for short periods (30s-60s).

## License

MIT
