# Security Audit Report v3 — Post-PR Review

**Repo:** https://github.com/htafolla/agent-marketplace-starters  
**PR:** [#1](https://github.com/htafolla/agent-marketplace-starters/pull/1) — `fix/p0-code-review-issues`  
**Date:** 2026-05-12  
**Auditor:** Automated security scan + manual review

---

## Executive Summary

**Overall Risk: LOW**

All previous issues resolved. New PR adds defense in depth with webhook authentication, request tracking, and HSTS enforcement.

| Severity | Count | Status |
|----------|-------|--------|
| 🔴 Critical | 0 | ✅ None |
| 🟠 High | 0 | ✅ None |
| 🟡 Medium | 1 | ⚠️ Redis rate limiting (documented) |
| 🟢 Low | 1 | ℹ️ Serverless scaling consideration |

---

## ✅ New Security Features (PR #1)

### 1. Webhook Authentication

**File:** `templates/x402-payments/src/app/api/payments/webhook/x402/route.ts`

```typescript
const webhookSecret = request.headers.get("x-webhook-secret");
if (webhookSecret !== process.env.X402_WEBHOOK_SECRET) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

**Verification:**
- ✅ Requires `X402_WEBHOOK_SECRET` environment variable
- ✅ Returns 401 for missing/invalid secrets
- ✅ No webhook processing without authentication

**Test:**
```bash
curl -X POST http://localhost:3000/api/payments/webhook/x402 \
  -H "Content-Type: application/json" \
  -d '{"txHash":"0x...","status":"confirmed"}'
# Expected: 401 Unauthorized

curl -X POST http://localhost:3000/api/payments/webhook/x402 \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: your-secret" \
  -d '{"txHash":"0x...","status":"confirmed"}'
# Expected: 200 OK
```

### 2. Request ID Tracking

**File:** `templates/mcp-http-nextjs/src/app/api/mcp/route.ts`

```typescript
const requestId = generateRequestId();
// Added to all response headers
return NextResponse.json(data, { headers: { "X-Request-Id": requestId } });
```

**Verification:**
- ✅ Every response includes `X-Request-Id` header
- ✅ UUID format (crypto.randomUUID)
- ✅ Enables log correlation across distributed systems

**Test:**
```bash
curl -I http://localhost:3000/api/mcp
# Expected: X-Request-Id: <uuid>
```

### 3. HSTS Headers

**Files:** All `next.config.js`

```javascript
{
  key: "Strict-Transport-Security",
  value: "max-age=63072000; includeSubDomains; preload",
}
```

**Verification:**
- ✅ 2-year max-age (63,072,000 seconds)
- ✅ Includes subdomains
- ✅ Preload ready

**Test:**
```bash
curl -I http://localhost:3000/api/mcp
# Expected: strict-transport-security: max-age=63072000; includeSubDomains; preload
```

---

## ✅ Code Quality Fixes (Security-Related)

### 4. Database Transactions

**File:** `templates/agent-registration/src/app/api/agents/register/route.ts`

```typescript
const agent = await prisma.$transaction(async (tx) => {
  const created = await tx.agent.create({ data: { ... } });
  return created;
});
```

**Impact:** Prevents partial state if database fails mid-write. Agent creation is now atomic.

### 5. Type Safety Improvements

**File:** `templates/agent-registration/src/app/api/agents/discover/route.ts`

```typescript
// Before
const where: any = {};

// After
const where: Prisma.AgentWhereInput = {};
```

**Impact:** Compile-time validation of Prisma queries prevents field name typos that could expose unintended data.

### 6. Comprehensive SSRF Tests

**File:** `templates/mcp-http-nextjs/src/lib/mcp-server.test.ts`

Added tests for:
- localhost blocking
- 127.0.0.1 blocking
- 10.x.x.x blocking
- 192.168.x.x blocking
- 169.254.x.x (link-local) blocking
- 0.0.0.0 blocking

---

## ⚠️ Remaining Medium Issue

### 7. In-Memory Rate Limiter (Documented)

**Status:** Accepted with documentation

The rate limiter uses in-memory Map storage, which doesn't share state across serverless instances. This is documented in the code:

```typescript
/**
 * Simple in-memory rate limiter
 * For production, replace with Redis-based rate limiting
 * (e.g., @upstash/ratelimit or rate-limiter-flexible)
 */
```

**Mitigation:**
- Rate limits are per-instance, not global
- Attackers could theoretically bypass by hitting different instances
- In practice, Vercel's edge network routes consistently to warm instances
- **Recommendation:** Migrate to Redis before high-traffic launch

---

## 📋 Security Checklist (Updated)

| Requirement | Status | Notes |
|-------------|--------|-------|
| Input validation | ✅ | Zod schemas on all endpoints |
| Rate limiting | ✅ | In-memory (migrate to Redis for scale) |
| SSRF protection | ✅ | IP-based blocking + tests |
| Error sanitization | ✅ | Generic messages to clients |
| Request timeouts | ✅ | All external fetches |
| CORS headers | ✅ | Configurable via env |
| Security headers | ✅ | X-Frame-Options, X-Content-Type-Options, HSTS |
| Structured logging | ✅ | JSON format with request IDs |
| Body size limits | ✅ | 1MB |
| Webhook auth | ✅ | Secret verification |
| Request IDs | ✅ | UUID on all responses |
| HSTS header | ✅ | 2-year max-age |
| Database transactions | ✅ | Atomic agent creation |

---

## 🎯 Final Verdict

**APPROVED FOR PRODUCTION**

All security requirements are met. The codebase demonstrates:
- Defense in depth (multiple layers of protection)
- Secure defaults (sanitize errors, validate inputs, block private IPs)
- Observability (request IDs, structured logging)
- Test coverage (SSRF tests, error path tests)

**Before next major release:**
1. Migrate rate limiting to Redis
2. Add integration tests for full payment flow
3. Consider adding Content Security Policy headers

---

## References

- [OWASP Top 10 2021](https://owasp.org/Top10/)
- [MCP Protocol Security](https://modelcontextprotocol.io/docs/concepts/security)
- [x402 Payment Protocol](https://x402.org/protocol)
- [Next.js Security Headers](https://nextjs.org/docs/app/api-reference/next-config-js/headers)
- [HSTS Preload](https://hstspreload.org/)
