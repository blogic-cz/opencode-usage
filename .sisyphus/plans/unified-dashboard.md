# Unified Multi-Source Usage Dashboard

## TL;DR

> **Quick Summary**: Add two features to opencode-usage CLI: (1) incremental watch mode that only processes new messages instead of re-scanning 106k+ files every 5 minutes, and (2) a unified `--dashboard` view combining usage data from 3 external sources (anthropic-multi-account, antigravity-auth quotas, Codex rate limits) alongside the existing usage table, with responsive terminal layout.
>
> **Deliverables**:
>
> - Optimized `--watch` mode with per-session incremental loading (~50ms refresh vs ~3s full scan)
> - New `--dashboard` flag rendering a responsive multi-source view (side-by-side >=168 cols, stacked <168)
> - 3 external source loaders: multi-account state file, antigravity quota cache, Codex usage API
> - Single render loop with staggered per-source refresh intervals
> - Graceful degradation when any external source is unavailable
>
> **Estimated Effort**: Large (7 tasks across 4 waves)
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: Task 1 → Task 4/5 → Task 6 → Task 7

---

## Context

### Original Request

Add watch mode optimization (cursor-based incremental loading) and a unified multi-source usage dashboard combining 4 data sources in a responsive terminal layout. Stay TypeScript/Bun.

### Interview Summary

**Key Discussions**:

- **Feature independence**: Separate `--watch` (now optimized) and `--dashboard` (new view) flags that combine
- **HAR strategy**: Skip HAR file parsing entirely. Call Codex API directly at `GET https://chatgpt.com/backend-api/wham/usage`
- **Layout**: Oracle-designed responsive layout — side-by-side at >=168 terminal columns, stacked below that, with column compression tiers
- **Technology**: Stay TypeScript/Bun (Rust migration rejected)
- **Refresh**: Staggered intervals — multi-account 10s, antigravity 60s, codex 60s, opencode 5min
- **Tests**: No test infrastructure exists, not setting up. Agent-Executed QA only.

**Research Findings**:

- Codebase: 7 files in `src/`, pure functions, zero dependencies, dual Bun/Node.js runtime
- 106,533 message files across 2,552 session directories — full scan takes ~2-5s
- Multi-account state: `utilization` 0-1 (0=empty, 1=full), reset in Unix **seconds** (not ms)
- Antigravity quota: `remainingFraction` 0-1 (**inverted**: 0=exhausted, 1=full), ISO 8601 reset
- Codex auth (`~/.codex/auth.json`): contains OpenAI API JWT tokens (`aud: api.openai.com/v1`), NOT ChatGPT web cookies — **auth compatibility with chatgpt.com backend is uncertain**
- Line-by-line rendering confirmed feasible for split layout, no cursor positioning needed
- Session directory IDs do NOT sort chronologically — must use mtime-based detection

### Metis Review

**Identified Gaps** (all addressed):

- **Codex auth incompatibility**: `~/.codex/auth.json` tokens are for `api.openai.com`, not `chatgpt.com/backend-api`. Resolved: implement with graceful fallback — if API rejects, show "unavailable" in panel, not a blocker.
- **Cursor strategy revision**: Session IDs don't sort chronologically. Resolved: use per-session directory mtime + file count comparison instead of global cursor.
- **Multi-timer render conflicts**: 4 independent setInterval timers could cause double-renders. Resolved: single 1s render loop with per-source age tracking.
- **Missing source graceful degradation**: Not all users have all sources. Resolved: each loader returns `T | null`, dashboard renders only available sources.
- **Non-TTY piping**: `process.stdout.columns` is undefined when piped. Resolved: TTY guard on `--dashboard`, error with helpful message.
- **`--dashboard` without `--watch`**: Ambiguous behavior. Resolved: `--dashboard` auto-implies `--watch`.
- **Message files modified after creation**: Files have both `time.created` and `time.completed`. Resolved: use directory mtime (covers both cases).

---

## Work Objectives

### Core Objective

Make watch mode performant (incremental loading) and add a unified dashboard combining opencode usage with anthropic multi-account quotas, antigravity auth quotas, and codex rate limits in a responsive terminal layout.

### Concrete Deliverables

- Modified `src/loader.ts` — incremental loading with `WatchState` tracking
- Modified `src/types.ts` — new types for external sources and dashboard data
- Modified `src/cli.ts` — `--dashboard` flag with TTY guard
- Modified `src/index.ts` — single render loop, staggered refresh, dashboard mode wiring
- New `src/source-loaders.ts` — 3 external source loaders (multi-account, antigravity, codex)
- New `src/dashboard-renderer.ts` — responsive layout renderer with progress bars

### Definition of Done

- [ ] `bun run dev --watch --days 1` shows incremental timing on refresh (< 200ms)
- [ ] `bun run dev --dashboard` renders multi-source view with available data
- [ ] `bun run build && node dist/index.js --dashboard` works identically in Node.js
- [ ] Missing source files → panel shows "not configured" (no crash)
- [ ] `bun run dev --dashboard | cat` → stderr error "requires interactive terminal"
- [ ] Existing `--watch`, `--days`, `--json`, `--monthly`, `--provider` flags work unchanged

### Must Have

- Incremental loading in watch mode (per-session file count tracking)
- Dashboard with at least multi-account and antigravity panels
- Responsive layout (side-by-side and stacked modes)
- Single render loop (not multiple timers)
- Graceful degradation per source
- TTY guard on `--dashboard`
- Dual runtime (Bun + Node.js)

### Must NOT Have (Guardrails)

- NO ANSI colors/styling — current codebase is plain Unicode, keep it that way
- NO terminal resize listener — check `process.stdout.columns` once per render cycle only
- NO cursor persistence to disk — in-memory state only for watch mode
- NO token refresh logic — read existing tokens, if expired show "expired" in panel
- NO interactive features — no key handlers, scroll, selection, or TUI framework
- NO retry/backoff for HTTP calls — single fetch() with try/catch, show "unavailable" on failure
- NO new npm dependencies — zero dependencies must be maintained
- NO refactoring of existing renderTable() — it stays completely untouched
- NO premature abstraction — simple functions, not class hierarchies or plugin systems

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks in this plan MUST be verifiable WITHOUT any human action.
> Every criterion is verified by running a command or using a tool.

### Test Decision

- **Infrastructure exists**: NO
- **Automated tests**: NO
- **Framework**: N/A
- **Agent-Executed QA**: MANDATORY for all tasks

### Agent-Executed QA Scenarios (MANDATORY — ALL tasks)

> No test infrastructure. QA scenarios are the PRIMARY verification method.
> The executing agent directly runs the deliverable and verifies output.

**Verification Tool by Deliverable Type:**

| Type               | Tool                        | How Agent Verifies                                 |
| ------------------ | --------------------------- | -------------------------------------------------- |
| Type definitions   | Bash (tsc)                  | `tsc --noEmit` passes with zero errors             |
| Source loaders     | Bash (bun run)              | Import and call loader, verify output shape        |
| Dashboard renderer | Bash (bun run)              | Render to string, verify column counts and content |
| CLI integration    | Bash (bun run dev)          | Run with flags, capture stdout, verify output      |
| Dual runtime       | Bash (bun run build + node) | Build, run with Node.js, compare output            |

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: Add dashboard types to types.ts
├── Task 2: Add incremental loading to loader.ts
└── Task 3: Add --dashboard flag to cli.ts

Wave 2 (After Wave 1):
├── Task 4: Create source-loaders.ts
└── Task 5: Create dashboard-renderer.ts

Wave 3 (After Wave 2):
└── Task 6: Wire dashboard into index.ts (render loop + refresh)

Wave 4 (After Wave 3):
└── Task 7: Integration QA (dual runtime, responsive, degradation)

Critical Path: Task 1 → Task 4/5 → Task 6 → Task 7
Parallel Speedup: ~35% faster than sequential
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
| ---- | ---------- | ------ | -------------------- |
| 1    | None       | 4, 5   | 2, 3                 |
| 2    | None       | 6      | 1, 3                 |
| 3    | None       | 6      | 1, 2                 |
| 4    | 1          | 6      | 5                    |
| 5    | 1          | 6      | 4                    |
| 6    | 2, 3, 4, 5 | 7      | None                 |
| 7    | 6          | None   | None (final)         |

### Agent Dispatch Summary

| Wave | Tasks   | Recommended Dispatch                           |
| ---- | ------- | ---------------------------------------------- |
| 1    | 1, 2, 3 | 3 parallel agents: quick × 3                   |
| 2    | 4, 5    | 2 parallel agents: unspecified-high × 2        |
| 3    | 6       | 1 agent: unspecified-high (integration wiring) |
| 4    | 7       | 1 agent: unspecified-high (QA verification)    |

---

## TODOs

- [ ] 1. Add dashboard types to types.ts

  **What to do**:
  - Add `MultiAccountState` type matching the state file schema at `~/.local/share/opencode/multi-account-state.json`
  - Add `AntigravityQuotaData` type matching the cached quota structure from antigravity accounts storage
  - Add `CodexUsageData` type matching the Codex API response at `GET chatgpt.com/backend-api/wham/usage`
  - Add `DashboardData` aggregate type containing all sources (each nullable for graceful degradation)
  - Add `WatchState` type for incremental loader state tracking (per-session file counts)
  - Follow existing pattern: `export type X = { ... }` (not interface)

  **Must NOT do**:
  - Do NOT use `interface` — codebase uses `type` everywhere
  - Do NOT add types for features not in this plan (no generic plugin system)
  - Do NOT import external types from other projects — define independently

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, additive type definitions, straightforward
  - **Skills**: []
    - No special skills needed for type definitions
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not UI work

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 4, 5
  - **Blocked By**: None

  **References**:

  **Pattern References** (existing code to follow):
  - `src/types.ts:1-62` — All existing type definitions. Follow the `export type X = { ... }` pattern exactly. Note `TokenUsage`, `MessageJson`, `DailyStats`, `ProviderStats` as examples.

  **API/Type References** (external data contracts):
  - Multi-account state file (`~/.local/share/opencode/multi-account-state.json`):
    ```typescript
    // Schema from anthropic-multi-account/src/cli.ts
    {
      currentAccount: string;
      usage: Record<
        string,
        {
          session5h: { utilization: number; reset: number | null }; // 0-1 fraction, Unix seconds
          weekly7d: { utilization: number; reset: number | null };
          weekly7dSonnet: { utilization: number; reset: number | null };
        }
      >;
    }
    ```
  - Antigravity quota cache (from `opencode-antigravity-auth/src/plugin/quota.ts:16-40`):
    ```typescript
    // Groups: "claude" | "gemini-pro" | "gemini-flash"
    // Each: { remainingFraction?: number; resetTime?: string; modelCount: number }
    // remainingFraction: 0=exhausted, 1=full (INVERTED vs multi-account)
    ```
  - Codex usage API response:
    ```typescript
    {
      rate_limit: {
        primary_window: {
          used_percent: number;
          reset_at: number;
        } // 5h window
        secondary_window: {
          used_percent: number;
          reset_at: number;
        } // weekly
      }
      code_review_rate_limit: {
        primary_window: {
          used_percent: number;
          reset_at: number;
        }
      }
    }
    ```
  - Codex auth file (`~/.codex/auth.json`):
    ```typescript
    {
      tokens: {
        access_token: string; // JWT for api.openai.com — MAY NOT work with chatgpt.com backend
        refresh_token: string;
        account_id: string; // UUID
      }
      last_refresh: string; // ISO 8601
    }
    ```

  **WHY Each Reference Matters**:
  - `src/types.ts` — Copy the exact `export type` pattern and style
  - Multi-account schema — Defines the shape of the state file read by source loader
  - Antigravity quota types — Note the INVERTED semantics (remaining vs utilization)
  - Codex response — Defines the API response shape; `used_percent` is 0-100 (not 0-1)
  - Codex auth — Needed for `CodexAuthConfig` type; note the JWT may be expired or incompatible

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Type definitions compile without errors
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run: bun tsc --noEmit --project /Users/gabrielecegi/bp/opencode-usage/tsconfig.json
      2. Assert: exit code 0
      3. Assert: no output (no errors)
    Expected Result: All types compile cleanly
    Evidence: Terminal output captured

  Scenario: New types are exported and importable
    Tool: Bash
    Preconditions: types.ts updated
    Steps:
      1. Create temp file: /tmp/test-types.ts with content:
         import type { MultiAccountState, AntigravityQuotaData, CodexUsageData, DashboardData, WatchState } from "./src/types.js";
         const _check: DashboardData = {} as any;
      2. Run: bun tsc --noEmit /tmp/test-types.ts --moduleResolution bundler --module esnext
      3. Assert: exit code 0
    Expected Result: All new types are importable
    Evidence: Terminal output captured
  ```

  **Commit**: YES
  - Message: `feat(types): add dashboard and external source type definitions`
  - Files: `src/types.ts`
  - Pre-commit: `bun tsc --noEmit`

---

- [ ] 2. Add incremental loading to loader.ts

  **What to do**:
  - Add a new exported function `loadMessagesIncremental(storagePath, providerFilter?, watchState?)` that:
    1. On first call (no watchState): performs full scan like existing `loadMessages()`, builds `WatchState` with `Map<sessionDir, fileCount>`, returns all messages + new watchState
    2. On subsequent calls (with watchState): `readdir` each session dir, compare file count to stored count, only `readJsonFile` for sessions where count increased, return ONLY new messages + updated watchState
  - Use directory `stat()` mtime to skip unchanged session directories entirely (optimization: only readdir sessions modified since last check)
  - WatchState is in-memory only — NOT persisted to disk
  - Keep existing `loadMessages()` completely unchanged (backward compatibility)
  - Follow the existing `readJsonFile()` dual-runtime pattern at line 15-19

  **Must NOT do**:
  - Do NOT modify existing `loadMessages()` function — it must remain untouched
  - Do NOT persist WatchState to disk (no `.cursor.json`)
  - Do NOT add file-level mtime tracking (session-level is sufficient)
  - Do NOT sort session IDs chronologically (they don't sort that way)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Core performance optimization with correctness requirements
  - **Skills**: []
    - No special skills needed
  - **Skills Evaluated but Omitted**:
    - `git-master`: Not git work

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 6
  - **Blocked By**: None

  **References**:

  **Pattern References** (existing code to follow):
  - `src/loader.ts:6` — Runtime detection: `const isBun = typeof globalThis.Bun !== "undefined";`
  - `src/loader.ts:15-19` — `readJsonFile()` dual-runtime file reading pattern (Bun.file().text() vs readFile())
  - `src/loader.ts:22-39` — `collectFilePaths()` — current directory scanning approach to extend
  - `src/loader.ts:41-53` — `processInBatches()` — batch processing pattern to reuse
  - `src/loader.ts:55-92` — `loadMessages()` — the existing full-scan function that MUST NOT change. The new function returns the same `MessageJson[]` type.

  **API/Type References**:
  - `src/types.ts:15-31` — `MessageJson` type — the return type for both full and incremental loads
  - `WatchState` type (from Task 1) — `Map<sessionDir, { fileCount: number; lastMtime: number }>`

  **External References**:
  - Node.js `readdir` and `stat` from `node:fs/promises` — already imported at line 1

  **WHY Each Reference Matters**:
  - `loader.ts:6` — MUST use same `isBun` pattern for any new Bun-specific code
  - `loader.ts:15-19` — MUST use same dual-runtime reading for new files
  - `loader.ts:22-39` — Understand current scanning to build the incremental version on top
  - `loader.ts:55-92` — The contract: new function MUST return same `MessageJson[]`, same filtering logic

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Full scan produces same results as existing loadMessages
    Tool: Bash
    Preconditions: opencode storage directory exists with messages
    Steps:
      1. Create temp script /tmp/test-incremental.ts:
         import { loadMessages } from "./src/loader.js";
         import { loadMessagesIncremental } from "./src/loader.js";
         import { getOpenCodeStoragePath } from "./src/loader.js";
         const path = getOpenCodeStoragePath();
         const full = await loadMessages(path);
         const { messages: incr } = await loadMessagesIncremental(path);
         console.log(`full=${full.length} incremental=${incr.length} match=${full.length === incr.length}`);
      2. Run: bun run /tmp/test-incremental.ts
      3. Assert: output contains "match=true"
    Expected Result: Incremental first load matches full load exactly
    Evidence: Terminal output with counts

  Scenario: Incremental refresh returns only new messages
    Tool: Bash
    Preconditions: opencode storage exists
    Steps:
      1. Create temp script /tmp/test-incr-refresh.ts:
         import { loadMessagesIncremental } from "./src/loader.js";
         import { getOpenCodeStoragePath } from "./src/loader.js";
         const path = getOpenCodeStoragePath();
         const first = await loadMessagesIncremental(path);
         console.log(`first_load=${first.messages.length}`);
         // Second call with state — no new messages expected
         const second = await loadMessagesIncremental(path, undefined, first.watchState);
         console.log(`refresh=${second.messages.length}`);
         // Should be 0 or very small (only if new messages arrived between calls)
      2. Run: bun run /tmp/test-incr-refresh.ts
      3. Assert: output shows first_load > 0 and refresh = 0 (or very small number)
    Expected Result: Incremental refresh returns near-zero messages when nothing changed
    Evidence: Terminal output with timing

  Scenario: TypeScript compilation passes
    Tool: Bash
    Steps:
      1. Run: bun tsc --noEmit
      2. Assert: exit code 0
    Expected Result: No type errors
    Evidence: Terminal output
  ```

  **Commit**: YES
  - Message: `perf(loader): add incremental loading for optimized watch mode`
  - Files: `src/loader.ts`
  - Pre-commit: `bun tsc --noEmit`

---

- [ ] 3. Add --dashboard flag to cli.ts

  **What to do**:
  - Add `dashboard?: boolean` to `CliArgs` type at line 7-15
  - Add `dashboard: { type: "boolean", short: "D" }` to parseArgs options at line 63-73 (use capital D since lowercase d is taken by --days)
  - Map `values.dashboard` in the return object at line 81-89
  - Update `printHelp()` at line 100-127 to document `--dashboard` flag
  - Note in help: `--dashboard` auto-enables watch mode

  **Must NOT do**:
  - Do NOT change any existing flag behavior
  - Do NOT add TTY guard here (that goes in index.ts, Task 6)
  - Do NOT change the parseDate() function or any other existing logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Trivial single-file change, adding one boolean flag
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - All: too simple to need skills

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Task 6
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/cli.ts:7-15` — `CliArgs` type definition to extend with `dashboard?: boolean`
  - `src/cli.ts:59-98` — `parseArgs()` function — follow exact pattern for adding boolean flag
  - `src/cli.ts:63-73` — Options object within parseArgs — add `dashboard` entry here
  - `src/cli.ts:81-89` — Return mapping — add `dashboard: values.dashboard` here
  - `src/cli.ts:100-127` — `printHelp()` — add `--dashboard` line after `--watch` line

  **WHY Each Reference Matters**:
  - Line 7-15: The ONLY place to add the type — must match existing pattern
  - Line 63-73: Follow exact object structure for the new flag
  - Line 81-89: Map value to return, matching other boolean flags like `json`, `monthly`, `watch`
  - Line 100-127: Help text must be updated for discoverability

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: --dashboard flag is parsed correctly
    Tool: Bash
    Preconditions: cli.ts updated
    Steps:
      1. Create temp script /tmp/test-cli.ts:
         import { parseArgs } from "./src/cli.js";
         // Monkey-patch Bun.argv to include --dashboard
         Bun.argv = ["bun", "test", "--dashboard", "--days", "7"];
         const args = parseArgs();
         console.log(JSON.stringify(args));
      2. Run: bun run /tmp/test-cli.ts
      3. Assert: output contains "dashboard":true
      4. Assert: output contains "days":7
    Expected Result: Dashboard flag parsed alongside existing flags
    Evidence: JSON output captured

  Scenario: -D short flag works
    Tool: Bash
    Steps:
      1. Create temp script with Bun.argv = ["bun", "test", "-D"]
      2. Run and assert dashboard:true in output
    Expected Result: Short flag -D works
    Evidence: Terminal output

  Scenario: Help text includes --dashboard
    Tool: Bash
    Steps:
      1. Run: bun run src/index.ts --help 2>&1 || true
      2. Assert: output contains "--dashboard" and "-D"
    Expected Result: Help text documents new flag
    Evidence: Terminal output

  Scenario: Existing flags unchanged
    Tool: Bash
    Steps:
      1. Run: bun run src/index.ts --days 3 --provider anthropic --json
      2. Assert: exit code 0
      3. Assert: output is valid JSON
    Expected Result: No regression on existing flags
    Evidence: Terminal output
  ```

  **Commit**: YES (groups with Task 1)
  - Message: `feat(cli): add --dashboard flag for unified multi-source view`
  - Files: `src/cli.ts`
  - Pre-commit: `bun tsc --noEmit`

---

- [ ] 4. Create source-loaders.ts for external data sources

  **What to do**:
  - Create new file `src/source-loaders.ts` with 3 loader functions, each returning `T | null` (null = source unavailable):

  **Loader 1: `loadMultiAccountState(): Promise<MultiAccountState | null>`**
  - Read `~/.local/share/opencode/multi-account-state.json`
  - Use dual-runtime file reading pattern from `loader.ts:15-19`
  - Parse JSON, validate shape minimally (check `usage` key exists)
  - Return null if file doesn't exist or parse fails
  - Note: `utilization` is 0-1 (0=empty, 1=full), `reset` is Unix SECONDS

  **Loader 2: `loadAntigravityQuota(): Promise<AntigravityQuotaData | null>`**
  - Read `~/.config/opencode/antigravity-accounts.json`
  - Parse the v3 storage format — extract `cachedQuota` from each account
  - Return null if file doesn't exist or has no quota data
  - Note: `remainingFraction` is 0-1 (0=exhausted, 1=full) — INVERTED vs multi-account

  **Loader 3: `loadCodexUsage(): Promise<CodexUsageData | null>`**
  - Read `~/.codex/auth.json` for `tokens.access_token` and `tokens.account_id`
  - Call `GET https://chatgpt.com/backend-api/wham/usage` with:
    - `Authorization: Bearer <access_token>` header
    - `chatgpt-account-id: <account_id>` header
  - **IMPORTANT**: This MAY fail — the access_token is for `api.openai.com`, not `chatgpt.com`. If fetch returns non-200, return null gracefully.
  - Single fetch with AbortController timeout (10s). No retries.
  - Return null if auth file missing, token expired, API rejects, or network fails
  - Note: `used_percent` is 0-100 (not 0-1), `reset_at` is Unix seconds

  **Must NOT do**:
  - Do NOT implement token refresh logic
  - Do NOT add retry/backoff
  - Do NOT throw exceptions — always return null on failure
  - Do NOT add dependencies (use global `fetch()`)
  - Do NOT import from other projects (anthropic-multi-account, antigravity-auth)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple loaders with different data sources, auth handling, error paths
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not browser work
    - `frontend-ui-ux`: Not UI work

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 5)
  - **Blocks**: Task 6
  - **Blocked By**: Task 1 (needs types)

  **References**:

  **Pattern References** (existing code to follow):
  - `src/loader.ts:6` — `const isBun = typeof globalThis.Bun !== "undefined";` — MUST reuse this pattern
  - `src/loader.ts:15-19` — `readJsonFile()` — dual-runtime file reading. Copy this pattern for reading state files.
  - `src/loader.ts:1` — imports `readFile` from `node:fs/promises` — same import for Node.js fallback
  - `src/loader.ts:2-3` — imports `homedir` from `node:os` and `join` from `node:path` — needed for path construction

  **API/Type References**:
  - `src/types.ts` — `MultiAccountState`, `AntigravityQuotaData`, `CodexUsageData` types (from Task 1)
  - Multi-account state path: `join(homedir(), ".local", "share", "opencode", "multi-account-state.json")`
  - Antigravity accounts path: `join(homedir(), ".config", "opencode", "antigravity-accounts.json")`
  - Codex auth path: `join(homedir(), ".codex", "auth.json")`
  - Codex API: `GET https://chatgpt.com/backend-api/wham/usage`

  **External References**:
  - `~/.codex/auth.json` — structure: `{ tokens: { access_token, account_id }, last_refresh }`. Token audience is `api.openai.com/v1`. The `account_id` is `72747952-c3ae-43d3-ae33-afeb1001da88`.
  - `/Users/gabrielecegi/bp/opencode-antigravity-auth/src/plugin/quota.ts:16-40` — QuotaGroup, QuotaGroupSummary types to understand the antigravity schema
  - `/Users/gabrielecegi/bp/opencode-antigravity-auth/src/plugin/quota.ts:91-98` — `normalizeRemainingFraction()` — reference for how to normalize fraction values (clamp 0-1, handle non-number)
  - `/Users/gabrielecegi/bp/anthropic-multi-account/src/cli.ts` — state file reading pattern and utilization semantics

  **WHY Each Reference Matters**:
  - `loader.ts:6,15-19` — MUST follow same dual-runtime pattern for consistency
  - Type references — Loaders must return exactly these types
  - Codex auth structure — Understand the JWT tokens and know they may not work with chatgpt.com
  - Antigravity quota.ts — Understand the normalized fraction semantics and the v3 storage format

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Multi-account loader reads state file successfully
    Tool: Bash
    Preconditions: ~/.local/share/opencode/multi-account-state.json exists
    Steps:
      1. Create temp script /tmp/test-loaders.ts:
         import { loadMultiAccountState } from "./src/source-loaders.js";
         const state = await loadMultiAccountState();
         if (state) {
           console.log(`accounts=${Object.keys(state.usage).length}`);
           console.log(`current=${state.currentAccount}`);
           console.log("OK");
         } else {
           console.log("NULL");
         }
      2. Run: bun run /tmp/test-loaders.ts
      3. Assert: output contains "OK" (or "NULL" if file doesn't exist — acceptable)
    Expected Result: Loader returns parsed state or null
    Evidence: Terminal output

  Scenario: Antigravity loader reads quota cache
    Tool: Bash
    Steps:
      1. Import loadAntigravityQuota, call it, log result shape
      2. Assert: returns object with quota groups or null
    Expected Result: Loader handles antigravity data
    Evidence: Terminal output

  Scenario: Codex loader handles auth gracefully
    Tool: Bash
    Steps:
      1. Import loadCodexUsage, call it
      2. Log result: either CodexUsageData or null
      3. Assert: no uncaught exceptions regardless of API response
    Expected Result: Returns data or null — never throws
    Evidence: Terminal output

  Scenario: Missing source file returns null (not crash)
    Tool: Bash
    Steps:
      1. Temporarily rename ~/.local/share/opencode/multi-account-state.json to .bak
      2. Call loadMultiAccountState()
      3. Assert: returns null (not throw)
      4. Rename back
    Expected Result: Graceful null return on missing files
    Evidence: Terminal output

  Scenario: TypeScript compilation passes
    Tool: Bash
    Steps:
      1. Run: bun tsc --noEmit
      2. Assert: exit code 0
    Expected Result: No type errors
    Evidence: Terminal output
  ```

  **Commit**: YES
  - Message: `feat(sources): add multi-account, antigravity, and codex source loaders`
  - Files: `src/source-loaders.ts`
  - Pre-commit: `bun tsc --noEmit`

---

- [ ] 5. Create dashboard-renderer.ts for responsive layout

  **What to do**:
  - Create new file `src/dashboard-renderer.ts` with a `renderDashboard()` function
  - Input: `DashboardData` (from types.ts) containing table stats + external sources (nullable)
  - Detects terminal width via `process.stdout.columns || 120`
  - **Wide mode (>=168 cols)**: Side-by-side layout
    - LEFT panel: existing table data (call internal table builder, NOT `renderTable()` from renderer.ts)
    - RIGHT panel: quota/usage bars for available sources
    - Combine rows: pad left to leftWidth, concat right, print line by line
  - **Narrow mode (<168 cols)**: Stacked layout
    - Table on top (reuse existing renderTable() for this)
    - Quota panel below (separate section)
  - Render progress bars using Unicode block characters (`█`, `░`) — NO ANSI colors
  - For each source panel:
    - **Multi-account**: Show each account with 3 windows (session5h, weekly7d, weekly7dSonnet). Format: `acct [████░░░░░░] 48% 3h12m`
    - **Antigravity**: Show each quota group (claude, gemini-pro, gemini-flash). Format: `claude [████████░░] 89% Feb17`
    - **Codex**: Show primary (5h) and secondary (weekly) windows. Format: `5h [█░░░░░░░░░] 2% 4h`
    - **Unavailable source**: Show `[source]: not configured` (single line)
  - Format reset times as relative durations: "3h12m", "2d5h", "45m", "resetting..."
  - Print watch mode status line at bottom: `[Dashboard] Updated: HH:MM:SS | Sources: 3/3 | Ctrl+C to exit`

  **Must NOT do**:
  - Do NOT add ANSI color codes — plain Unicode only (█ and ░ for bars)
  - Do NOT import or modify renderer.ts — this is a separate file
  - Do NOT add terminal resize listeners
  - Do NOT use cursor positioning (ANSI escape sequences for movement) — line-by-line only
  - Do NOT add interactive features

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Complex terminal layout logic with responsive breakpoints and multiple panel types
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Terminal rendering, not browser UI

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 4)
  - **Blocks**: Task 6
  - **Blocked By**: Task 1 (needs types)

  **References**:

  **Pattern References** (existing code to follow):
  - `src/renderer.ts:7-21` — `formatNumber()`, `formatCost()`, `padRight()`, `padLeft()` — import and reuse these helpers
  - `src/renderer.ts:128-139` — Unicode box drawing characters — reuse same character set for panel borders
  - `src/renderer.ts:110-301` — `renderTable()` — study the row construction approach (string concatenation with padding), but do NOT modify this function
  - `src/index.ts:26-31` — Screen clearing functions — dashboard will use these via index.ts (not directly)

  **API/Type References**:
  - `src/types.ts` — `DashboardData`, `DailyStats`, `MultiAccountState`, `AntigravityQuotaData`, `CodexUsageData` types (from Task 1)
  - `src/renderer.ts:23-51` — `JsonOutput` type — study as pattern for structured output typing

  **External References** (rendering patterns to study):
  - `/Users/gabrielecegi/bp/opencode-antigravity-auth/script/watch-quota.ts` — Progress bar rendering with `█` and `░`, formatReset() for relative time display
  - `/Users/gabrielecegi/bp/anthropic-multi-account/src/cli.ts` — Progress bar with half-block support (`▌`), colorization logic (but we skip colors)

  **Documentation References**:
  - Oracle layout design from interview:

    ```
    WIDE (>=168): side-by-side
    +-------------- OpenCode ---------------+  +------------ Quotas --------------+
    | Date     Models      Total       Cost |  | anthropic [ACTIVE: max-5x]       |
    | 2025-12  claude-opus 174M      $167   |  | Session5h [#####-----] 48% 3h    |
    | Total               397M       $418   |  | Weekly    [########--] 78% Feb17 |
    +---------------------------------------+  +----------------------------------+

    NARROW (<168): stacked
    +-------------------- OpenCode ---------------------+
    | Date       Total Tokens           Cost            |
    | Total      397.1M                $417.81          |
    +--------------------------------------------------+
    +-------------------- Quotas -----------------------+
    | anthropic [ACTIVE: max-5x]: 5h 48% | week 78%    |
    | antigravity: Claude 89% | Pro 100% | Flash 95%   |
    | codex: 5h 95% | week 89% | review 100%           |
    +--------------------------------------------------+
    ```

  **WHY Each Reference Matters**:
  - `renderer.ts:7-21` — Reuse formatting helpers instead of duplicating
  - `renderer.ts:128-139` — Same Unicode box characters for visual consistency
  - `renderer.ts:110-301` — Understand the row construction approach to build compatible left-panel rows
  - watch-quota.ts — Reference for progress bar rendering (bar width, percent formatting, reset time)
  - Oracle layout — The exact target layout to implement

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Wide layout renders side-by-side at 180 columns
    Tool: Bash
    Preconditions: dashboard-renderer.ts created, types defined
    Steps:
      1. Create temp script that:
         - Sets process.stdout.columns = 180
         - Imports renderDashboard
         - Creates mock DashboardData with sample stats and multi-account data
         - Captures output by redirecting console.log
         - Checks that output lines have content in both left and right halves
      2. Run: bun run /tmp/test-wide.ts
      3. Assert: lines are approximately 180 chars wide
      4. Assert: left side contains table headers (Date, Models, etc.)
      5. Assert: right side contains progress bar characters (█ or ░)
    Expected Result: Side-by-side layout at wide terminal
    Evidence: Terminal output captured

  Scenario: Narrow layout stacks vertically at 120 columns
    Tool: Bash
    Steps:
      1. Set process.stdout.columns = 120
      2. Render dashboard with mock data
      3. Assert: table appears first, then quota panel below
      4. Assert: no line exceeds 120 characters
    Expected Result: Stacked layout at narrow terminal
    Evidence: Terminal output captured

  Scenario: Missing sources render "not configured"
    Tool: Bash
    Steps:
      1. Render dashboard with DashboardData where multiAccount=null, antigravity=null, codex=null
      2. Assert: output contains "not configured" for each missing source
      3. Assert: no crash
    Expected Result: Graceful degradation for missing sources
    Evidence: Terminal output

  Scenario: Progress bars show correct percentages
    Tool: Bash
    Steps:
      1. Create mock multi-account with utilization=0.48 for session5h
      2. Render dashboard
      3. Assert: output contains "48%" near the progress bar
    Expected Result: Percentages rendered correctly
    Evidence: Terminal output

  Scenario: TypeScript compilation passes
    Tool: Bash
    Steps:
      1. Run: bun tsc --noEmit
      2. Assert: exit code 0
    Expected Result: No type errors
    Evidence: Terminal output
  ```

  **Commit**: YES
  - Message: `feat(dashboard): add responsive multi-source dashboard renderer`
  - Files: `src/dashboard-renderer.ts`
  - Pre-commit: `bun tsc --noEmit`

---

- [ ] 6. Wire dashboard mode into index.ts with single render loop

  **What to do**:
  This is the integration task that connects everything. Modify `src/index.ts`:

  **6a. Add TTY guard for --dashboard:**
  - After parsing args, if `dashboard` is true and `!process.stdout.isTTY`, write to stderr: `"Error: --dashboard requires an interactive terminal (cannot be piped)"` and `process.exit(1)`

  **6b. Auto-enable watch for --dashboard:**
  - If `dashboard` is true, force `watch = true` (dashboard always implies watch mode)

  **6c. Import new modules:**
  - Import `loadMessagesIncremental` from `./loader.js`
  - Import `loadMultiAccountState`, `loadAntigravityQuota`, `loadCodexUsage` from `./source-loaders.js`
  - Import `renderDashboard` from `./dashboard-renderer.js`

  **6d. Create single render loop for dashboard mode (replaces setInterval pattern):**

  ```
  if (dashboard):
    clearScreen()
    // Full initial load
    const { messages, watchState } = await loadMessagesIncremental(storagePath, provider)
    const [multiAccount, antigravity, codex] = await Promise.all([
      loadMultiAccountState(), loadAntigravityQuota(), loadCodexUsage()
    ])
    // Aggregate and render
    let stats = aggregateByDate(messages) → apply filters
    renderDashboard({ stats, multiAccount, antigravity, codex })

    // Single render loop with per-source age tracking
    const sourceAges = { multiAccount: 0, antigravity: 0, codex: 0, opencode: 0 }
    const intervals = { multiAccount: 10_000, antigravity: 60_000, codex: 60_000, opencode: 300_000 }

    setInterval(async () => {
      const now = Date.now()
      let needsRender = false

      // Check each source independently
      if (now - sourceAges.multiAccount >= intervals.multiAccount):
        multiAccount = await loadMultiAccountState()
        sourceAges.multiAccount = now
        needsRender = true

      if (now - sourceAges.antigravity >= intervals.antigravity):
        antigravity = await loadAntigravityQuota()
        sourceAges.antigravity = now
        needsRender = true

      if (now - sourceAges.codex >= intervals.codex):
        codex = await loadCodexUsage()
        sourceAges.codex = now
        needsRender = true

      if (now - sourceAges.opencode >= intervals.opencode):
        const result = await loadMessagesIncremental(storagePath, provider, watchState)
        // Merge new messages into existing stats
        const newStats = aggregateByDate(result.messages)
        // Merge newStats into stats (add to existing DailyStats)
        watchState = result.watchState
        sourceAges.opencode = now
        needsRender = true

      if (needsRender):
        homeThenClearBelow()
        renderDashboard({ stats, multiAccount, antigravity, codex })
    }, 1000)  // Check every 1 second
  ```

  **6e. Optimize existing --watch (non-dashboard) with incremental loading:**
  - In the `if (watch && !dashboard)` branch, replace `loadMessages()` calls with `loadMessagesIncremental()`
  - First call: full load, capture watchState
  - setInterval calls: incremental load with watchState, merge into existing aggregation
  - Keep existing renderTable() behavior unchanged

  **6f. Handle incremental stats merging:**
  - Create helper `mergeStats(existing: Map<string, DailyStats>, newMessages: MessageJson[])` that:
    - Aggregates new messages into DailyStats
    - Merges into existing map (add tokens, costs, models, providers)
    - This avoids re-aggregating everything on each refresh

  **Must NOT do**:
  - Do NOT change the non-watch, non-dashboard code path (single-run mode stays identical)
  - Do NOT add multiple independent setIntervals — use ONE 1-second interval with age tracking
  - Do NOT add interactive key handlers
  - Do NOT add terminal resize listener

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration wiring connecting 5 modules with state management and render coordination
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - All: integration work, no specialized domain

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential)
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 2, 3, 4, 5

  **References**:

  **Pattern References** (existing code to follow):
  - `src/index.ts:14-22` — Import statements — add new imports following same pattern
  - `src/index.ts:24` — `WATCH_INTERVAL_MS` constant — replace with per-source intervals for dashboard mode
  - `src/index.ts:26-31` — `clearScreen()` and `homeThenClearBelow()` — reuse for dashboard mode
  - `src/index.ts:34-95` — `renderUsage()` — the existing render function. Do NOT modify. Create a new `renderDashboardUsage()` alongside it.
  - `src/index.ts:97-123` — `main()` — add dashboard branch here. Keep existing watch and single-run branches untouched.
  - `src/index.ts:112-119` — Existing watch mode setInterval — optimize with incremental loading but preserve structure

  **API/Type References**:
  - `src/types.ts` — `DashboardData`, `WatchState` (from Task 1)
  - `src/loader.ts` — `loadMessagesIncremental()` signature (from Task 2)
  - `src/source-loaders.ts` — `loadMultiAccountState()`, `loadAntigravityQuota()`, `loadCodexUsage()` signatures (from Task 4)
  - `src/dashboard-renderer.ts` — `renderDashboard()` signature (from Task 5)
  - `src/aggregator.ts:12-78` — `aggregateByDate()` — used for both full and incremental aggregation
  - `src/cli.ts:7-15` — `CliArgs` with new `dashboard` field (from Task 3)

  **WHY Each Reference Matters**:
  - `index.ts:34-95` — renderUsage() is the contract — it MUST NOT change. New dashboard logic sits beside it.
  - `index.ts:97-123` — main() is the wiring point — add dashboard branch without breaking existing branches
  - `index.ts:112-119` — Existing watch mode — optimize with incremental loading, same visual behavior
  - aggregator.ts — Need aggregateByDate() for both full and incremental paths
  - All Task 2-5 outputs — This task connects them all

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Dashboard mode launches and renders
    Tool: Bash
    Preconditions: All previous tasks complete, dev server ready
    Steps:
      1. Run: timeout 15 bun run src/index.ts --dashboard --days 3 2>&1 | head -50
      2. Assert: output contains usage table data (dates, tokens)
      3. Assert: output contains at least one source panel (multi-account OR antigravity)
      4. Assert: output contains "Dashboard" in status line
      5. Assert: no uncaught errors in output
    Expected Result: Dashboard renders with available data
    Evidence: First 50 lines of terminal output

  Scenario: Non-TTY piping rejects --dashboard
    Tool: Bash
    Steps:
      1. Run: bun run src/index.ts --dashboard 2>/tmp/dashboard-err.txt | cat; echo "EXIT=$?"
      2. Read /tmp/dashboard-err.txt
      3. Assert: stderr contains "requires an interactive terminal"
      4. Assert: exit code is 1
    Expected Result: Clean error for piped output
    Evidence: stderr content and exit code

  Scenario: --dashboard auto-enables --watch
    Tool: Bash
    Steps:
      1. Run: timeout 8 bun run src/index.ts --dashboard --days 1 2>&1 | head -30
      2. Assert: output contains watch-related status (refresh timing or update timestamp)
    Expected Result: Watch mode active without explicit --watch
    Evidence: Terminal output

  Scenario: Existing --watch (no dashboard) still works with incremental optimization
    Tool: Bash
    Steps:
      1. Run: timeout 15 bun run src/index.ts --watch --days 1 2>&1 | head -30
      2. Assert: output contains standard table format (Date, Models, Input, Output)
      3. Assert: no dashboard-specific elements (no progress bars)
    Expected Result: Existing watch mode unchanged visually
    Evidence: Terminal output

  Scenario: Existing single-run mode unchanged
    Tool: Bash
    Steps:
      1. Run: bun run src/index.ts --days 3 --json
      2. Assert: valid JSON output with periods and totals
      3. Assert: exit code 0
    Expected Result: Single-run mode completely unaffected
    Evidence: JSON output

  Scenario: TypeScript compilation passes
    Tool: Bash
    Steps:
      1. Run: bun tsc --noEmit
      2. Assert: exit code 0
    Expected Result: No type errors after wiring
    Evidence: Terminal output
  ```

  **Commit**: YES
  - Message: `feat(dashboard): wire single render loop with staggered multi-source refresh`
  - Files: `src/index.ts`
  - Pre-commit: `bun tsc --noEmit`

---

- [ ] 7. Integration QA — dual runtime, responsive layout, graceful degradation

  **What to do**:
  - Build the project for Node.js: `bun run build`
  - Run full QA suite verifying all features work in both Bun and Node.js
  - Test responsive layout at multiple terminal widths
  - Test graceful degradation by temporarily removing source files
  - Verify all existing flags still work unchanged
  - Fix any issues found

  **Must NOT do**:
  - Do NOT add test files or test framework
  - Do NOT modify code unless fixing a bug found during QA
  - Do NOT change behavior — only verify and fix

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Comprehensive QA across runtimes and scenarios
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not browser work — this is terminal CLI testing

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (final, sequential)
  - **Blocks**: None (final task)
  - **Blocked By**: Task 6

  **References**:

  **Pattern References**:
  - `package.json:46` — Build script: `bun run build` produces `dist/index.js`
  - `package.json:29-31` — Bin entry: `"opencode-usage": "dist/index.js"` — test via `node dist/index.js`

  **Documentation References**:
  - `CLAUDE.md` — "Test both runtimes after changes (Bun and Node.js)"
  - `CLAUDE.md` — Build commands: `bun run build && node dist/index.js --days 3`

  **WHY Each Reference Matters**:
  - Build script — Must build before testing Node.js
  - CLAUDE.md — Project-mandated QA requirement for dual runtime

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Build succeeds
    Tool: Bash
    Preconditions: All source files from Tasks 1-6 in place
    Steps:
      1. Run: bun run build
      2. Assert: exit code 0
      3. Assert: dist/index.js exists
    Expected Result: Clean build
    Evidence: Build output

  Scenario: Node.js single-run mode works
    Tool: Bash
    Steps:
      1. Run: node dist/index.js --days 3
      2. Assert: exit code 0
      3. Assert: output contains table with Date column
    Expected Result: Node.js runtime works for existing features
    Evidence: Terminal output

  Scenario: Node.js --json mode works
    Tool: Bash
    Steps:
      1. Run: node dist/index.js --days 3 --json
      2. Assert: valid JSON with "periods" and "totals" keys
    Expected Result: JSON output identical in Node.js
    Evidence: JSON output

  Scenario: Node.js dashboard mode works
    Tool: Bash
    Steps:
      1. Run: timeout 10 node dist/index.js --dashboard --days 1 2>&1 | head -40
      2. Assert: output contains table data
      3. Assert: output contains source panels or "not configured"
    Expected Result: Dashboard renders in Node.js
    Evidence: Terminal output

  Scenario: Node.js non-TTY guard works
    Tool: Bash
    Steps:
      1. Run: node dist/index.js --dashboard 2>/tmp/node-err.txt | cat; echo "EXIT=$?"
      2. Assert: stderr contains "interactive terminal"
      3. Assert: exit code 1
    Expected Result: TTY guard works in Node.js
    Evidence: stderr and exit code

  Scenario: Bun dashboard at 180 columns
    Tool: Bash
    Steps:
      1. Run: COLUMNS=180 timeout 10 bun run src/index.ts --dashboard --days 1 2>&1 | head -50
      2. Assert: wide layout with side-by-side panels (if COLUMNS is respected)
    Expected Result: Wide responsive layout
    Evidence: Terminal output

  Scenario: Graceful degradation — rename multi-account state
    Tool: Bash
    Steps:
      1. Run: mv ~/.local/share/opencode/multi-account-state.json ~/.local/share/opencode/multi-account-state.json.bak 2>/dev/null; timeout 10 bun run src/index.ts --dashboard --days 1 2>&1 | head -30; mv ~/.local/share/opencode/multi-account-state.json.bak ~/.local/share/opencode/multi-account-state.json 2>/dev/null
      2. Assert: no crash, output contains "not configured" for multi-account panel
    Expected Result: Missing source handled gracefully
    Evidence: Terminal output

  Scenario: All existing CLI flags unchanged
    Tool: Bash
    Steps:
      1. Run: bun run src/index.ts --provider anthropic --days 7
      2. Assert: output shows anthropic-only data
      3. Run: bun run src/index.ts --monthly --since 1m
      4. Assert: output shows monthly aggregation
      5. Run: bun run src/index.ts --help
      6. Assert: help includes --dashboard
    Expected Result: Full backward compatibility
    Evidence: Terminal output for each command

  Scenario: Lint and type check pass
    Tool: Bash
    Steps:
      1. Run: bun run check
      2. Assert: exit code 0
    Expected Result: All checks pass
    Evidence: Check output
  ```

  **Commit**: YES (only if fixes are needed)
  - Message: `fix: address integration issues found during QA`
  - Files: (whatever needs fixing)
  - Pre-commit: `bun run check`

---

## Commit Strategy

| After Task(s) | Message                                                                        | Files                     | Verification                     |
| ------------- | ------------------------------------------------------------------------------ | ------------------------- | -------------------------------- |
| 1             | `feat(types): add dashboard and external source type definitions`              | src/types.ts              | `bun tsc --noEmit`               |
| 2             | `perf(loader): add incremental loading for optimized watch mode`               | src/loader.ts             | `bun tsc --noEmit`               |
| 3             | `feat(cli): add --dashboard flag for unified multi-source view`                | src/cli.ts                | `bun tsc --noEmit`               |
| 4             | `feat(sources): add multi-account, antigravity, and codex source loaders`      | src/source-loaders.ts     | `bun tsc --noEmit`               |
| 5             | `feat(dashboard): add responsive multi-source dashboard renderer`              | src/dashboard-renderer.ts | `bun tsc --noEmit`               |
| 6             | `feat(dashboard): wire single render loop with staggered multi-source refresh` | src/index.ts              | `bun tsc --noEmit`               |
| 7             | `fix: address integration issues found during QA` (if needed)                  | various                   | `bun run check && bun run build` |

---

## Success Criteria

### Verification Commands

```bash
# Type check
bun tsc --noEmit  # Expected: exit 0, no output

# Build
bun run build  # Expected: exit 0, dist/index.js created

# Full check (format + lint + typecheck)
bun run check  # Expected: exit 0

# Existing single-run mode
bun run dev -- --days 3  # Expected: table output with last 3 days

# Existing JSON mode
bun run dev -- --days 3 --json  # Expected: valid JSON

# Existing watch mode (optimized)
timeout 15 bun run dev -- --watch --days 1  # Expected: table with refresh status

# Dashboard mode
timeout 15 bun run dev -- --dashboard --days 3  # Expected: multi-source dashboard

# Node.js compatibility
bun run build && node dist/index.js --days 3  # Expected: same output as Bun
node dist/index.js --dashboard --days 1  # Expected: dashboard works in Node.js

# Non-TTY guard
bun run dev -- --dashboard | cat 2>&1  # Expected: stderr error
```

### Final Checklist

- [ ] All "Must Have" present (incremental loading, dashboard, responsive layout, single render loop, graceful degradation, TTY guard, dual runtime)
- [ ] All "Must NOT Have" absent (no colors, no resize listener, no disk persistence, no token refresh, no interactivity, no dependencies, no renderTable() changes)
- [ ] `bun run check` passes (format + lint + typecheck)
- [ ] `bun run build` succeeds
- [ ] `node dist/index.js` works for all modes
- [ ] Missing source files → "not configured" (no crash)
- [ ] Existing CLI flags unchanged
