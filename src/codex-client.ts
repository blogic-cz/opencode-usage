import type { QuotaSnapshot, CodexUsageResponse } from "./types.js";

const CODEX_API_URL = "https://chatgpt.com/backend-api/wham/usage";

/**
 * Fetch Codex usage quota from ChatGPT API
 * Requires a valid session token passed via --codex-token
 */
export async function loadCodexQuota(token?: string): Promise<QuotaSnapshot[]> {
  if (!token) {
    return [
      {
        source: "codex",
        label: "Codex",
        used: 0,
        error: "No --codex-token provided",
      },
    ];
  }

  try {
    const response = await fetch(CODEX_API_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return [
        {
          source: "codex",
          label: "Codex",
          used: 0,
          error: `API error: ${response.status}`,
        },
      ];
    }

    const data = (await response.json()) as CodexUsageResponse;
    const results: QuotaSnapshot[] = [];

    // Primary window = 5h limit
    if (data.rate_limit?.primary_window) {
      results.push({
        source: "codex",
        label: "Codex - 5h Limit",
        used: data.rate_limit.primary_window.used_percent / 100,
        resetAt: data.rate_limit.primary_window.reset_at,
      });
    }

    // Secondary window = weekly limit
    if (data.rate_limit?.secondary_window) {
      results.push({
        source: "codex",
        label: "Codex - Weekly",
        used: data.rate_limit.secondary_window.used_percent / 100,
        resetAt: data.rate_limit.secondary_window.reset_at,
      });
    }

    // Code review limit
    if (data.code_review_rate_limit?.primary_window) {
      results.push({
        source: "codex",
        label: "Codex - Code Review",
        used: data.code_review_rate_limit.primary_window.used_percent / 100,
        resetAt: data.code_review_rate_limit.primary_window.reset_at,
      });
    }

    return results.length > 0
      ? results
      : [
          {
            source: "codex",
            label: "Codex",
            used: 0,
            error: "No rate limit data",
          },
        ];
  } catch (err) {
    return [
      {
        source: "codex",
        label: "Codex",
        used: 0,
        error: `Request failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      },
    ];
  }
}
