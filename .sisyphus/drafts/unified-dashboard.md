# Draft: Unified Multi-Source Usage Dashboard

## Requirements (confirmed)

- Watch mode optimization: cursor-based continuation instead of full re-scan every 5 min
- Unified multi-source view: 4 sources combined in terminal dashboard
- Technology decision: Rust vs staying TypeScript/Bun needed

## Technical Decisions

- (pending) Layout approach: side-by-side vs stacked
- (pending) Rust vs TypeScript decision
- (pending) HAR file: one-time import vs live watch
- (pending) Watch mode: cursor tracking implementation approach

## Research Findings (from explore agents)

### Codebase Architecture (CONFIRMED)

- **Data flow**: disk → loader.loadMessages() → aggregator.aggregateByDate() → renderer.renderTable()
- **Watch mode**: setInterval(5min) in index.ts, calls renderUsage() which re-loads EVERYTHING
- **Loader**: Scans ~/.local/share/opencode/storage/message/, batches of 10k files, Bun+Node dual runtime
- **Aggregator**: Builds Map<date, DailyStats>, has filterByDays/filterByDateRange/aggregateByMonth
- **Renderer**: Unicode box drawing (hardcoded column widths, no terminal width detection currently)
- **CLI**: node:util parseArgs, flags: --provider, --days, --since, --until, --json, --monthly, --watch
- **Types**: MessageJson, TokenUsage, DailyStats, ProviderStats, ModelPricing
- **Pricing**: 40+ models, calculateCost() per million tokens

### Watch Mode Problem (CONFIRMED)

- No cursor/state tracking between runs
- loadMessages() scans entire directory tree every time
- aggregateByDate() reprocesses all messages from scratch
- 10k+ files rescanned every 5 minutes

### External Data Sources (CONFIRMED)

- **anthropic-multi-account**: State file at `~/.local/share/opencode/multi-account-state.json`
  - utilization: 0-1 fraction, 3 categories (session5h, weekly7d, weekly7dSonnet)
  - reset: Unix timestamp in SECONDS (not ms!)
  - Progress bars: 50-char, half-blocks, Red ≥70% / Yellow ≥50% / Green <50%
- **opencode-antigravity-auth**: Cached in `~/.config/opencode/antigravity-accounts.json` (v3)
  - remainingFraction: 0-1 (inverted! 0=exhausted, 1=full)
  - Groups: claude, gemini-pro, gemini-flash
  - Progress bars: 20-char, full blocks, Red <20% / Orange 20-60% / Green >60%
  - Reset time: ISO 8601 string, formatted as "resets in 2d 3h"
- **Codex HAR**: One-time static export at `/Users/gabrielecegi/Downloads/chatgpt.com.har.har`
  - Contains daily-token-usage-breakdown responses (30 days of data)
  - Surfaces: cli, vscode, web, slack, linear, jetbrains, sdk, exec, github, desktop_app
  - Values in PERCENT (0-100), not fractions
  - HAR is static snapshot — NOT regularly updated

### Terminal Rendering (CONFIRMED)

- **Current**: Unicode box drawing, hardcoded column widths, NO terminal width detection
- **Feasibility**: Side-by-side IS feasible using line-by-line construction
  - Use `process.stdout.columns || 120` for terminal width
  - 60/40 split (left table, right bars)
  - Combine left+right rows per line, then console.log()
  - NO cursor positioning needed — simpler line-by-line approach
  - Existing `homeThenClearBelow()` pattern works unchanged for watch mode
- **ANSI patterns available**: antigravity-auth has full ANSI library (ansi.ts) to reference
- **Zero dependencies**: No npm packages needed — pure ANSI codes

### Rust vs TypeScript (PENDING - awaiting librarian results)

## User Decisions (ALL CONFIRMED)

1. **Feature Independence**: Separate flags — `--watch` (optimized) + `--dashboard` (new view). Combine: `--watch --dashboard`
2. **HAR Strategy**: SKIP HAR parsing. Call Codex API directly at `GET https://chatgpt.com/backend-api/wham/usage`
   - Returns rate_limit.primary_window (5h), secondary_window (weekly), code_review
   - Requires auth: `chatgpt-account-id` header + cookies
   - Auth source: `~/.codex/` dir or HAR import
3. **Layout**: Responsive with breakpoints (Oracle-designed):
   - `>=168 cols`: side-by-side (table LEFT, quotas RIGHT)
   - `<168 cols`: stacked (table on top, quotas below)
   - Column compression tiers for narrow terminals
4. **Technology**: Stay TypeScript/Bun (Rust migration rejected)
5. **Refresh**: Staggered — multi-account 10s, antigravity 60s, opencode 5min, codex 60s

## Test Strategy Decision

- **Infrastructure exists**: NO (zero test files, no test script in package.json)
- **Automated tests**: NO (not requested, keep CLI lightweight)
- **Agent-Executed QA**: ALWAYS (mandatory for all tasks)

## Scope Boundaries

- INCLUDE: watch optimization, unified dashboard, Codex API integration, responsive layout
- EXCLUDE: Rust migration, HAR file parsing, new npm dependencies, test infrastructure setup
