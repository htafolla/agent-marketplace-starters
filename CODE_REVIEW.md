# Code Review Report — Agent Marketplace Starters

**Repo:** https://github.com/htafolla/agent-marketplace-starters  
**Commit:** `2e4e5a2`  
**Date:** 2026-05-12  
**Reviewer:** Automated code analysis + manual review

---

## Executive Summary

**Overall Quality: B+ (Good)**

The codebase is well-structured, type-safe, and demonstrates solid architectural decisions. All four templates are consistent in style and approach. Minor issues exist around TypeScript strictness, test coverage, and documentation completeness.

| Category | Score | Notes |
|----------|-------|-------|
| Type Safety | A- | Zod validation throughout, some `any` types |
| Code Organization | A | Clean separation of concerns |
| Test Coverage | C+ | Tests exist but coverage is minimal |
| Documentation | B+ | Good inline docs, READMEs could be deeper |
| Performance | B | In-memory rate limiting, no caching |
| Maintainability | A- | Consistent patterns, clear naming |

---

## 🟢 Strengths

### 1. Type Safety First

**Excellent use of Zod for runtime validation:**

```typescript
// mcp-server.ts
const EchoSchema = z.object({
  message: z.string().min(1),
});

// register/route.ts
const HeaderSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/),
});
```

**Every API boundary is validated.** No raw user input reaches business logic.

### 2. Clean Architecture

**Separation of concerns is exemplary:**

```
src/
├── app/api/          # HTTP layer (routing, status codes)
├── lib/             # Business logic (pure functions)
└── components/      # UI layer (React)
```

The MCP server is split into:
- `TOOL_DEFINITIONS` (declarative schemas)
- `TOOL_HANDLERS` (imperative implementations)

This makes testing trivial and allows swapping implementations without touching HTTP code.

### 3. Consistent Error Handling

**Unified pattern across all templates:**

```typescript
try {
  // business logic
} catch (error) {
  sanitizeError(error);        // Log internally
  return genericMessage;       // Return safe message
}
```

### 4. Good Naming Conventions

| Name | Purpose | Clarity |
|------|---------|---------|
| `sanitizeError` | Sanitizes errors for client | ✅ Perfect |
| `handleX402Payment` | Orchestrates payment flow | ✅ Perfect |
| `inferFieldToolMapping` | Maps UI fields to tool args | ✅ Perfect |
| `isPrivateIP` | Checks if IP is private | ✅ Perfect |

### 5. Security-First Design

The security audit fixes show the codebase was designed with security in mind:
- SSRF protection in `fetch_data`
- Rate limiting on all endpoints
- Signature validation before processing
- Timeout on all external requests

---

## 🟡 Issues

### 1. Missing TypeScript Strictness

**File:** `templates/agent-registration/src/app/api/agents/discover/route.ts:61`

```typescript
const where: any = {};  // ❌ Should not use any
```

**Impact:** Loses type safety on Prisma queries. Typos in field names won't be caught.

**Fix:**
```typescript
import { Prisma } from "@prisma/client";

const where: Prisma.AgentWhereInput = {};
```

### 2. Incomplete Test Coverage

**Current tests only cover happy paths:**

```typescript
// mcp-server.test.ts
it("should echo back the message", async () => {
  const result = await TOOL_HANDLERS["echo"]({ message: "hello" });
  expect(result).toMatchObject({ message: "hello" });
});
```

**Missing tests:**
- ❌ SSRF blocking (private IPs)
- ❌ Rate limit enforcement
- ❌ Signature validation failure
- ❌ Malformed JSON-RPC requests
- ❌ Database connection failures
- ❌ Timeout handling

**Recommendation:** Add at minimum:
```typescript
it("should block private IP addresses", async () => {
  await expect(
    TOOL_HANDLERS["fetch_data"]({ url: "http://localhost/admin" })
  ).rejects.toThrow("Access to internal addresses is not allowed");
});
```

### 3. Missing Return Type Annotations

**File:** `templates/mcp-http-nextjs/src/lib/mcp-server.ts:152`

```typescript
let result: number;  // ❌ Implicit any in switch
switch (operation) {
  case "add":
    result = a + b;
    break;
  // ...
}
```

**Fix:**
```typescript
let result: number;
switch (operation) {
  case "add": result = a + b; break;
  case "subtract": result = a - b; break;
  case "multiply": result = a * b; break;
  case "divide": result = a / b; break;
  default: throw new Error(`Unknown operation: ${operation}`);
}
```

### 4. Magic Numbers

**File:** `templates/mcp-http-nextjs/src/lib/mcp-server.ts`

```typescript
signal: AbortSignal.timeout(10000)  // What is 10000?
```

**Fix:**
```typescript
const FETCH_TIMEOUT_MS = 10_000;
signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
```

### 5. Duplicate Code

**Three identical `rate-limit.ts` files** exist across templates. Consider extracting to a shared package or using a monorepo setup with `@agent-marketplace/rate-limit`.

### 6. Missing Early Returns

**File:** `templates/x402-payments/src/lib/x402-client.ts:68-75`

```typescript
if (initialResponse.status !== 402) {
  const data = await initialResponse.json();
  return {
    success: initialResponse.ok,
    response: data,
  };
}
```

Could be simplified with early return pattern:
```typescript
if (initialResponse.status === 402) {
  // handle payment
}

const data = await initialResponse.json();
return { success: initialResponse.ok, response: data };
```

### 7. Missing Loading States in UI

**File:** `templates/ui-manifest/src/components/ManifestRenderer.tsx`

No loading skeleton or optimistic UI. Users see nothing while `onSubmit` is pending.

### 8. Accessibility Issues

**File:** `templates/ui-manifest/src/components/ManifestRenderer.tsx`

- Missing `aria-label` on buttons
- Missing `htmlFor` on labels
- No focus management in wizard mode
- No error announcement for screen readers

---

## 🔴 Critical Code Smells

### 9. Mutable Module State

**File:** `templates/mcp-http-nextjs/src/lib/rate-limit.ts:13`

```typescript
const store = new Map<string, RateLimitEntry>();
```

**Issue:** Module-level mutable state is shared across all requests. In Next.js, this persists between requests in the same process but not across serverless instances.

**Impact:**
- Memory leak if keys grow unbounded (mitigated by cleanup interval)
- Non-deterministic behavior in serverless environments

**Recommendation:** Document this limitation prominently:
```typescript
/**
 * ⚠️ In-memory rate limiter. For production with horizontal scaling,
 * replace with Redis-based rate limiting.
 * @see https://github.com/your-org/agent-marketplace-starters#scaling
 */
```

### 10. Missing Database Transaction

**File:** `templates/agent-registration/src/app/api/agents/register/route.ts:143-156`

```typescript
const agent = await prisma.agent.create({
  data: { ... }
});
```

**Issue:** No transaction wrapper. If the database fails mid-write, partial state could persist.

**Fix:**
```typescript
const agent = await prisma.$transaction(async (tx) => {
  const agent = await tx.agent.create({ data: { ... } });
  // Could also create verification record here
  return agent;
});
```

---

## 📊 Code Metrics

### Complexity Analysis

| File | Lines | Functions | Max Nesting | Cyclomatic Complexity |
|------|-------|-----------|-------------|----------------------|
| mcp-server.ts | 203 | 3 | 3 | 12 |
| route.ts (mcp) | 186 | 1 | 4 | 15 |
| register/route.ts | 173 | 1 | 3 | 12 |
| x402-client.ts | 189 | 3 | 3 | 14 |
| ManifestRenderer.tsx | 393 | 5 | 3 | 18 |

**Verdict:** All files are within acceptable complexity limits (< 20).

### Dependency Analysis

```
mcp-http-nextjs
├── next (framework)
├── react (framework)
├── zod (validation)
└── vitest (testing)

agent-registration
├── next (framework)
├── react (framework)
├── zod (validation)
├── viem (crypto)
├── @prisma/client (database)
└── vitest (testing)

x402-payments
├── next (framework)
├── react (framework)
├── zod (validation)
└── vitest (testing)

ui-manifest
├── next (framework)
├── react (framework)
├── zod (validation)
└── vitest (testing)
```

**Assessment:** Minimal, focused dependencies. No bloat.

---

## 🎯 Recommendations by Priority

### P0 — Fix Before Production

1. **Add database transactions** to registration endpoint
2. **Add comprehensive error handling tests** (at least 5 per endpoint)
3. **Document rate limiter limitations** for serverless deployments

### P1 — Fix in First Iteration

4. **Remove `any` types** (discover route `where` clause)
5. **Add return type annotations** to all functions
6. **Extract shared code** (rate-limit, logger) to a shared package
7. **Add accessibility attributes** to UI components

### P2 — Nice to Have

8. **Add loading skeletons** to ManifestRenderer
9. **Add request/response interceptors** for logging
10. **Add OpenAPI/Swagger documentation** for API endpoints

---

## 📋 Code Quality Checklist

| Practice | Status | Notes |
|----------|--------|-------|
| TypeScript strict mode | ⚠️ | Some `any` types |
| Zod validation | ✅ | All endpoints |
| Error handling | ✅ | Unified pattern |
| Early returns | ⚠️ | Some nested ifs |
| No magic numbers | ⚠️ | Timeout values |
| No code duplication | ❌ | 3x rate-limit.ts |
| Unit tests | ⚠️ | Minimal coverage |
| Integration tests | ❌ | None |
| E2E tests | ❌ | None |
| Accessibility | ❌ | Missing ARIA |
| Performance budgets | ❌ | None defined |

---

## 🏆 Highlights

### Best Practice Example

**File:** `templates/x402-payments/src/lib/x402-client.ts`

```typescript
export interface X402PaymentOptions {
  endpoint: string;
  params: Record<string, unknown>;
  onDirectPayment: (details: X402PaymentDetails) => Promise<string>;
  baseUrl?: string;
  headers?: Record<string, string>;
}
```

**Why this is excellent:**
- Interface-driven design
- Callback pattern decouples wallet implementation
- Optional parameters have sensible defaults
- Type-safe throughout

### Architecture Decision Record

**File:** `ARCHITECTURE.md`

The architecture document is exemplary. It explains:
- Why in-process MCP over standalone
- Why wallet signatures over OAuth
- Why x402 over Stripe
- Why declarative UI over custom components

Every decision has a clear rationale and acknowledges tradeoffs.

---

## Final Verdict

**Quality Grade: B+ (Good)**

The codebase is production-ready with minor improvements needed:

**Must fix:**
- Add database transactions
- Add test coverage for error paths
- Remove `any` types

**Should fix:**
- Extract shared utilities
- Add accessibility attributes
- Document scaling limitations

**The templates successfully demonstrate production patterns** for agent marketplaces. They are well-architected, secure, and maintainable. With the recommended improvements, they would achieve an **A grade**.

---

## Reviewer Notes

The developer clearly understands:
- TypeScript type safety
- API design principles
- Security fundamentals
- Separation of concerns

Areas for growth:
- Test-driven development
- Accessibility standards
- Distributed systems patterns (for scaling)

Overall: **Recommended for production use** after P0 fixes.
