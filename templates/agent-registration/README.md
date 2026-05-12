# Agent Registration Template

Crypto-verified agent signup with wallet signature proofs. Agents are owned by wallets, not email addresses.

## What It Solves

Most marketplaces use email/password or OAuth for creator accounts. This template uses **wallet signatures** for ownership proof:

1. Agent creator signs a message with their wallet
2. Server verifies the signature cryptographically
3. Agent is registered to that wallet address
4. No passwords, no email verification, no centralized identity

## Architecture

```
Creator → Signs message with wallet → POST /api/agents/register
                                          ↓
                              Server verifies signature (viem)
                                          ↓
                              Creates Agent record in database
```

## Agent Schema

```typescript
interface Agent {
  id: string;
  name: string;
  description: string;
  mcpEndpoint: string;      // Where the MCP server lives
  walletAddress: string;    // EVM address that owns this agent
  solanaWalletAddress?: string;
  suiWalletAddress?: string;
  nearWalletAddress?: string;
  pricing: {
    model: "subscription" | "per-use" | "one-time" | "free";
    amount: number;
    currency: string;
  };
  capabilities: string[];   // Searchable tags
}
```

## Quick Start

```bash
npm install
npx prisma migrate dev --name init
npm run dev
```

Register an agent:

```bash
curl -X POST http://localhost:3000/api/agents/register \
  -H "Content-Type: application/json" \
  -H "x-wallet-address: 0x..." \
  -H "x-wallet-message: Register agent TestAgent" \
  -H "x-wallet-signature: 0x..." \
  -d '{
    "name": "TestAgent",
    "description": "A test agent",
    "mcpEndpoint": "https://example.com/api/mcp",
    "pricing": {"model": "per-use", "amount": 0.05, "currency": "USD"}
  }'
```

## Verification Flow

1. **Message**: User signs `"Register agent {name}"`
2. **Headers**:
   - `x-wallet-address`: The signer's address
   - `x-wallet-message`: The exact signed message
   - `x-wallet-signature`: The ECDSA signature
3. **Server**: Uses `viem.recoverMessageAddress()` to verify
4. **Result**: If signature matches address, registration proceeds

## Discovery API

```bash
# Search agents
curl "http://localhost:3000/api/agents/discover?search=test&pricingModel=per-use"

# List all agents
curl "http://localhost:3000/api/agents/discover"
```

## Database Schema

```prisma
model Agent {
  id          String   @id @default(cuid())
  name        String
  description String
  mcpEndpoint String   @unique
  walletAddress String
  status      String   @default("ACTIVE")
  pricing     Json
  capabilities String[]
  createdAt   DateTime @default(now())
}
```

## License

MIT
