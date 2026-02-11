# Unified Dashboard - Learnings

## Typed Fetch Mocking Pattern for Bun Tests

**Problem:** Bun's `fetch` type includes static properties like `preconnect`, so direct assignment of async functions fails:

```typescript
// ❌ Type error: Property 'preconnect' is missing
global.fetch = async () => new Response(...);
```

**Solution:** Create a typed wrapper helper that uses type assertion:

```typescript
function mockFetch(
  fn: (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>
) {
  global.fetch = fn as typeof global.fetch;
}

// ✅ Now use it consistently
mockFetch(async () => new Response(...));
mockFetch(async (url, init) => { /* capture args */ });
```

**Benefits:**

- Type-safe: Function signature is checked before assertion
- Consistent: Single pattern across all test mocks
- Minimal: No external dependencies or complex setup
- Preserves assertions: Can still capture headers, methods, etc.

**Applied to:** `src/__tests__/codex-client.test.ts` - all 10 tests pass, build succeeds.
