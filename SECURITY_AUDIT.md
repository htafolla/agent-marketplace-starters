# Security Audit Report — Agent Marketplace Starters

**Repo:** https://github.com/htafolla/agent-marketplace-starters  
**Commit:** `e789c69`  
**Auditor:** Automated security scan + manual review  
**Date:** 2026-05-12

---

## Executive Summary

**Overall Risk: MEDIUM**

The codebase is clean of critical vulnerabilities (no hardcoded secrets, no SQL injection, no XSS). However, several medium-risk issues exist that should be addressed before production use, primarily around SSRF, rate limiting, and information disclosure.

| Severity | Count | Status |
|----------|-------|--------|
| 🔴 Critical | 1 | SSRF in MCP tool |
| 🟠 High | 2 | Rate limiting, error disclosure |
| 🟡 Medium | 5 | Auth, CORS, input validation |
| 🟢 Low | 4 | Logging, configuration |

---

## 🔴 Critical

### 1. SSRF in `fetch_data` MCP Tool

**File:** `templates/mcp-http-nextjs/src/lib/mcp-server.ts:148`  
**Severity:** Critical  
**CVSS:** 8.6

```typescript
fetch_data: async (args) => {
  const { url } = FetchDataSchema.parse(args);
  const response = await fetch(url, { ... });  // ← User-controlled URL
```

**Issue:** The `fetch_data` tool accepts any URL from user input and performs an HTTP request to it. This enables Server-Side Request Forgery (SSRF).

**Impact:**
- Access to internal services (localhost, `169.254.169.254` for AWS metadata, Kubernetes API)
- Cloud metadata exfiltration (AWS IAM credentials from `http://169.254.169.254/latest/meta-data/iam/security-credentials/`)
- Internal network scanning
- Access to private databases/admin panels

**Proof of Concept:**
```json
{
  "name": "fetch_data",
  "arguments": { "url": "http://169.254.169.254/latest/meta-data/" }
}
```

**Remediation:**
```typescript
const ALLOWED_HOSTS = process.env.ALLOWED_FETCH_HOSTS?.split(",") || [];

fetch_data: async (args) => {
  const { url } = FetchDataSchema.parse(args);
  const parsed = new URL(url);
  
  // Block private IPs and internal ranges
  const hostname = parsed.hostname;
  if (isPrivateIP(hostname)) {
    throw new Error("Access to internal addresses is not allowed");
  }
  
  // Optional: allowlist
  if (ALLOWED_HOSTS.length > 0 && !ALLOWED_HOSTS.includes(hostname)) {
    throw new Error("Host not in allowlist");
  }
  
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000), // Timeout
  });
  // ...
}
```

**Recommended Action:** Remove `fetch_data` from example tools or implement strict allowlisting + IP blocking before production use.

---

## 🟠 High

### 2. Missing Rate Limiting

**Files:** 
- `templates/agent-registration/src/app/api/agents/register/route.ts`
- `templates/agent-registration/src/app/api/agents/discover/route.ts`
- `templates/mcp-http-nextjs/src/app/api/mcp/route.ts`
- `templates/x402-payments/src/app/api/payments/charge/route.ts`

**Severity:** High

**Issue:** No rate limiting on any API endpoint. Attackers can:
- Spam agent registrations (DoS, database bloat)
- Enumerate all agents via discovery API
- Flood MCP endpoint with tool calls
- Probe payment endpoints

**Remediation:**
```typescript
// Use @upstash/ratelimit or similar
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, "1 m"), // 10 requests per minute
});

export async function POST(request: NextRequest) {
  const ip = request.ip ?? "127.0.0.1";
  const { success } = await ratelimit.limit(ip);
  if (!success) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }
  // ...
}
```

### 3. Verbose Error Messages (Information Disclosure)

**Files:** Multiple

**Issue:** Error messages leak implementation details:

```typescript
// mcp-server.ts:133
trow new Error("Division by zero");  // OK - generic

// route.ts:140
{ error: `Registration failed: ${message}` }  // Could leak stack traces

// route.ts:67
{ error: "Signature verification failed" }  // OK
```

The `catch (error)` blocks that return `error.message` could expose:
- Database connection strings (if connection fails)
- Internal file paths
- Prisma query details
- Stack traces (in some Next.js configurations)

**Remediation:**
```typescript
// Log detailed error internally
console.error("Registration failed:", error);

// Return generic message to client
return NextResponse.json(
  { error: "Registration failed. Please try again later." },
  { status: 500 }
);
```

---

## 🟡 Medium

### 4. Missing Authentication on Discovery Endpoint

**File:** `templates/agent-registration/src/app/api/agents/discover/route.ts`

**Issue:** The discovery API is completely open. No authentication required to list all registered agents with their MCP endpoints.

**Impact:** Information disclosure about all agents in the marketplace.

**Remediation:** Add optional authentication or API key requirement:
```typescript
const apiKey = request.headers.get("x-api-key");
if (apiKey !== process.env.DISCOVERY_API_KEY) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

### 5. No CORS Configuration

**Files:** All API routes

**Issue:** No CORS headers are set. While this defaults to same-origin protection, it may break legitimate cross-origin use cases and doesn't prevent all attack vectors.

**Remediation:**
```typescript
// next.config.js
module.exports = {
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: process.env.ALLOWED_ORIGIN || "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type,Authorization" },
        ],
      },
    ];
  },
};
```

### 6. No Request Body Size Limits

**Files:** All POST endpoints

**Issue:** `request.json()` can parse arbitrarily large JSON payloads, leading to:
- Memory exhaustion (DoS)
- Slow parsing attacks

**Remediation:**
```typescript
// next.config.js
module.exports = {
  api: {
    bodyParser: {
      sizeLimit: "1mb",
    },
  },
};
```

### 7. Console Logging in Production

**Files:**
- `templates/agent-registration/src/app/api/agents/register/route.ts:107,110`
- `templates/x402-payments/src/app/api/payments/webhook/x402/route.ts:26`

**Issue:** `console.warn` and `console.log` statements exist in production code. These can:
- Leak sensitive data to logs
- Impact performance
- Fill up disk space in high-traffic scenarios

**Remediation:** Use a structured logger (Pino, Winston) with log levels:
```typescript
import { logger } from "@/lib/logger";

logger.warn({ endpoint: data.mcpEndpoint }, "MCP endpoint unreachable");
```

### 8. Missing Request Timeouts

**Files:**
- `templates/mcp-http-nextjs/src/lib/mcp-server.ts:148` (fetch_data tool)
- `templates/agent-registration/src/app/api/agents/register/route.ts:102` (MCP endpoint check)

**Issue:** External `fetch()` calls don't have timeouts, allowing:
- Hanging connections (resource exhaustion)
- Slowloris-style attacks

**Remediation:** Add `AbortSignal.timeout()` to all external fetches:
```typescript
const response = await fetch(url, {
  signal: AbortSignal.timeout(10000), // 10 second timeout
});
```

---

## 🟢 Low

### 9. Hardcoded Token Contract Addresses

**File:** `templates/x402-payments/src/app/api/payments/charge/route.ts:61-64`

**Issue:** USDC contract addresses are hardcoded. If a contract is upgraded or a network changes, code must be redeployed.

**Remediation:** Move to environment variables:
```typescript
const USDC_ADDRESSES: Record<string, string> = {
  base: process.env.USDC_BASE || "0x833589...",
  // ...
};
```

### 10. No Request ID / Correlation Tracking

**Issue:** No request tracing makes debugging production issues difficult.

**Remediation:** Add request IDs:
```typescript
const requestId = crypto.randomUUID();
// Include in all log entries and error responses
```

### 11. Missing Security Headers

**Issue:** No Content-Security-Policy, X-Frame-Options, or other security headers.

**Remediation:** Add headers in Next.js config or middleware:
```typescript
// middleware.ts
export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return response;
}
```

### 12. Zod Validation Bypass in Wallet Signature

**File:** `templates/agent-registration/src/app/api/agents/register/route.ts:54-56`

**Issue:** The signature is cast with `as \`0x${string}\`` without validation:
```typescript
signature: walletSignature as `0x${string}`,
```

While `recoverMessageAddress` will fail on invalid input, a malicious user could pass an extremely long string causing a DoS.

**Remediation:**
```typescript
const SignatureSchema = z.string().regex(/^0x[a-fA-F0-9]{130}$/); // ECDSA signature length
const validSignature = SignatureSchema.parse(walletSignature);
```

---

## Positive Security Findings

✅ **No hardcoded secrets or API keys**  
✅ **No SQL injection** — Prisma ORM used throughout, no raw queries  
✅ **No XSS** — No `innerHTML`, `dangerouslySetInnerHTML`, or user input rendered as HTML  
✅ **No prototype pollution** — No `__proto__` or `constructor` manipulation  
✅ **Input validation** — Zod schemas on all endpoints  
✅ **No eval/Function constructor**  
✅ **No insecure randomness**  
✅ **Proper error boundaries** — Errors caught and returned as JSON

---

## Remediation Priority

| Priority | Issue | Effort |
|----------|-------|--------|
| P0 | Fix SSRF in fetch_data tool | 30 min |
| P0 | Add rate limiting | 1 hour |
| P1 | Sanitize error messages | 30 min |
| P1 | Add request timeouts | 15 min |
| P2 | Add CORS configuration | 15 min |
| P2 | Add body size limits | 5 min |
| P2 | Replace console logs with structured logger | 1 hour |
| P3 | Add security headers | 15 min |
| P3 | Move hardcoded addresses to env vars | 15 min |

---

## Conclusion

The codebase demonstrates good security fundamentals (input validation, parameterized queries, no hardcoded secrets). The critical SSRF vulnerability in the example MCP tool must be addressed immediately. Rate limiting and error message sanitization should be added before any production deployment.

**Recommendation:** Fix P0 and P1 issues before public launch. P2 and P3 can be addressed in the first post-launch iteration.
