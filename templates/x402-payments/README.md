# x402 Payments Template

Multi-chain payment flow using the x402 protocol. Pay for agent usage with USDC on Base, Solana, Sui, or NEAR.

## What It Solves

Traditional payment flows:
1. User clicks "Buy"
2. Redirect to Stripe checkout
3. Wait for webhook
4. Grant access

x402 payment flow:
1. User's wallet signs a payment authorization
2. Request is sent with `X-Payment` header
3. Server verifies and settles
4. Response is immediate — no redirect, no webhook delay

## Architecture

```
User → Clicks "Run Agent" → Client checks balance
                              ↓
                        Signs x402 payment
                              ↓
                        POST /api/agents/invoke
                        Headers: X-Payment: <base64_payload>
                              ↓
                        Server verifies payment
                              ↓
                        Settles with facilitator
                              ↓
                        Executes agent call
```

## Supported Chains

| Chain | Token | Settlement |
|-------|-------|------------|
| Base | USDC | Direct transfer |
| Solana | USDC | Facilitator |
| Sui | SUI | Direct transfer |
| NEAR | USDC | Facilitator (gasless) |

## Quick Start

```bash
npm install
npm run dev
```

## Payment Flow

### 1. Client requests payment requirements

```typescript
const response = await fetch('/api/payments/charge', {
  method: 'POST',
  body: JSON.stringify({
    agentId: 'agent-123',
    amount: 0.05,
    currency: 'USD',
    chain: 'base',
  }),
});

// If payment required, returns 402 with x402 details
if (response.status === 402) {
  const { paymentRequirements } = await response.json();
  // User signs payment...
}
```

### 2. Client signs and retries with payment header

```typescript
const paymentHeader = await signPayment(paymentRequirements);

const result = await fetch('/api/agents/invoke', {
  method: 'POST',
  headers: {
    'X-Payment': paymentHeader,
  },
  body: JSON.stringify({
    agentId: 'agent-123',
    toolName: 'analyze',
    arguments: { data: '...' },
  }),
});
```

### 3. Server verifies payment

The server decodes the `X-Payment` header, verifies:
- Signature is valid
- Amount matches requirements
- Recipient is correct
- Not already settled (replay protection)

Then settles the payment and executes the agent call.

## Client Integration

Use the `x402-client.ts` helper:

```typescript
import { handleX402Payment } from '@/lib/x402-client';

const result = await handleX402Payment({
  endpoint: '/api/agents/invoke',
  params: { agentId, toolName, arguments },
  onDirectPayment: async (details) => {
    // Fallback: direct blockchain transfer
    return await wallet.sendTransaction(tx);
  },
});
```

## Server Integration

Use the payment middleware in your API route:

```typescript
import { verifyX402Payment } from '@/lib/payment-verifier';

export async function POST(request: Request) {
  const paymentHeader = request.headers.get('X-Payment');
  
  if (!paymentHeader) {
    return create402Response(agentPricing);
  }
  
  const verified = await verifyX402Payment(paymentHeader);
  if (!verified) {
    return new Response('Payment verification failed', { status: 402 });
  }
  
  // Execute the agent call...
}
```

## Configuration

```env
# Required
NEXT_PUBLIC_FACILITATOR_URL=https://facilitator.ultravioletadao.xyz

# Optional - for direct EVM payments
NEXT_PUBLIC_BASE_RPC_URL=https://mainnet.base.org

# Optional - for Solana
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

## License

MIT
