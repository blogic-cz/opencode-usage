import { describe, expect, test } from "bun:test";
import { renderQuotaPanel } from "../dashboard/quota-panel.js";
import type { QuotaSnapshot } from "../types.js";

describe("quota-panel", () => {
  test("renderQuotaPanel should handle empty quotas", () => {
    const quotas: QuotaSnapshot[] = [];
    const output = renderQuotaPanel(quotas, 80);
    expect(output).toContain("QUOTAS");
  });

  test("renderQuotaPanel should render single quota", () => {
    const quotas: QuotaSnapshot[] = [
      {
        source: "anthropic",
        label: "5h session",
        used: 0.75,
        resetAt: Date.now() + 3600 * 1000,
      },
    ];

    const output = renderQuotaPanel(quotas, 80);
    expect(output).toContain("ANTHROPIC");
    expect(output).toContain("5h session");
    expect(output).toContain("75%");
    expect(output).toContain("resets in");
  });

  test("renderQuotaPanel should render error states", () => {
    const quotas: QuotaSnapshot[] = [
      {
        source: "codex",
        label: "Weekly limit",
        used: 0,
        error: "Authentication failed",
      },
    ];

    const output = renderQuotaPanel(quotas, 80);
    expect(output).toContain("CODEX");
    expect(output).toContain("Weekly limit");
    expect(output).toContain("Authentication failed");
  });

  test("renderQuotaPanel should group by source", () => {
    const quotas: QuotaSnapshot[] = [
      { source: "anthropic", label: "5h", used: 0.5 },
      { source: "anthropic", label: "7d", used: 0.3 },
      { source: "codex", label: "Weekly", used: 0.8 },
    ];

    const output = renderQuotaPanel(quotas, 80);
    expect(output).toContain("ANTHROPIC");
    expect(output).toContain("CODEX");
    const lines = output.split("\n");
    const anthropicIndex = lines.findIndex((l) => l.includes("ANTHROPIC"));
    const codexIndex = lines.findIndex((l) => l.includes("CODEX"));
    const firstAnthropicQuotaIndex = lines.findIndex((l) => l.includes("5h"));
    const secondAnthropicQuotaIndex = lines.findIndex((l) => l.includes("7d"));
    const codexQuotaIndex = lines.findIndex((l) => l.includes("Weekly"));

    expect(anthropicIndex).toBeLessThan(firstAnthropicQuotaIndex);
    expect(anthropicIndex).toBeLessThan(secondAnthropicQuotaIndex);
    expect(codexIndex).toBeLessThan(codexQuotaIndex);
  });

  test("renderQuotaPanel should render progress bars", () => {
    const quotas: QuotaSnapshot[] = [
      { source: "anthropic", label: "Test", used: 0.5 },
    ];

    const output = renderQuotaPanel(quotas, 80);
    expect(output).toContain("█");
    expect(output).toContain("50%");
  });

  test("renderQuotaPanel should handle multiple sources sorted", () => {
    const quotas: QuotaSnapshot[] = [
      { source: "codex", label: "C1", used: 0.1 },
      { source: "antigravity", label: "A1", used: 0.2 },
      { source: "anthropic", label: "An1", used: 0.3 },
    ];

    const output = renderQuotaPanel(quotas, 80);
    expect(output).toContain("ANTIGRAVITY");
    expect(output).toContain("ANTHROPIC");
    expect(output).toContain("CODEX");

    const antigravityMatch = output.indexOf("ANTIGRAVITY");
    const anthropicMatch = output.indexOf("ANTHROPIC");
    const codexMatch = output.indexOf("CODEX");

    expect(anthropicMatch).toBeLessThan(antigravityMatch);
    expect(antigravityMatch).toBeLessThan(codexMatch);
  });

  test("renderQuotaPanel should format reset time correctly", () => {
    const quotas: QuotaSnapshot[] = [
      {
        source: "anthropic",
        label: "Short",
        used: 0.5,
        resetAt: Date.now() + 30 * 60 * 1000,
      },
      {
        source: "anthropic",
        label: "Long",
        used: 0.5,
        resetAt: Date.now() + 2.5 * 60 * 60 * 1000,
      },
    ];

    const output = renderQuotaPanel(quotas, 80);
    expect(output).toMatch(/resets in \d+m/);
    expect(output).toMatch(/resets in \d+h \d+m/);
  });
});
