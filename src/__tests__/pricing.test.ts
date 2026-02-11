import { describe, test, expect } from "bun:test";
import { getModelPricing, calculateCost } from "../pricing.js";
import type { TokenUsage } from "../types.js";

describe("pricing", () => {
  describe("getModelPricing", () => {
    test("returns correct pricing for claude-opus-4-5", () => {
      const pricing = getModelPricing("claude-opus-4-5");
      expect(pricing.input).toBe(5);
      expect(pricing.output).toBe(25);
      expect(pricing.cacheWrite).toBe(6.25);
      expect(pricing.cacheRead).toBe(0.5);
    });

    test("returns correct pricing for gpt-4o", () => {
      const pricing = getModelPricing("gpt-4o");
      expect(pricing.input).toBe(2.5);
      expect(pricing.output).toBe(10);
      expect(pricing.cacheWrite).toBe(0);
      expect(pricing.cacheRead).toBe(0);
    });

    test("returns correct pricing for claude-sonnet-4-5", () => {
      const pricing = getModelPricing("claude-sonnet-4-5");
      expect(pricing.input).toBe(3);
      expect(pricing.output).toBe(15);
      expect(pricing.cacheWrite).toBe(3.75);
      expect(pricing.cacheRead).toBe(0.3);
    });

    test("returns DEFAULT_PRICING for unknown model", () => {
      const pricing = getModelPricing("unknown-model-xyz");
      expect(pricing.input).toBe(3);
      expect(pricing.output).toBe(15);
      expect(pricing.cacheWrite).toBe(3.75);
      expect(pricing.cacheRead).toBe(0.3);
    });

    test("handles case-insensitive model names", () => {
      const pricing1 = getModelPricing("CLAUDE-OPUS-4-5");
      const pricing2 = getModelPricing("claude-opus-4-5");
      expect(pricing1).toEqual(pricing2);
    });

    test("handles underscore to dash conversion", () => {
      const pricing1 = getModelPricing("claude_opus_4_5");
      const pricing2 = getModelPricing("claude-opus-4-5");
      expect(pricing1).toEqual(pricing2);
    });

    test("matches partial model names", () => {
      const pricing = getModelPricing("claude-opus");
      expect(pricing.input).toBeGreaterThan(0);
    });
  });

  describe("calculateCost", () => {
    test("calculates cost for claude-opus-4-5 with input tokens only", () => {
      const tokens: TokenUsage = {
        input: 1_000_000,
        output: 0,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      };
      const cost = calculateCost(tokens, "claude-opus-4-5");
      expect(cost).toBe(5); // 1M input * $5 per 1M
    });

    test("calculates cost for claude-opus-4-5 with output tokens only", () => {
      const tokens: TokenUsage = {
        input: 0,
        output: 1_000_000,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      };
      const cost = calculateCost(tokens, "claude-opus-4-5");
      expect(cost).toBe(25); // 1M output * $25 per 1M
    });

    test("calculates cost with cache write tokens", () => {
      const tokens: TokenUsage = {
        input: 0,
        output: 0,
        reasoning: 0,
        cache: { read: 0, write: 1_000_000 },
      };
      const cost = calculateCost(tokens, "claude-opus-4-5");
      expect(cost).toBe(6.25); // 1M cache write * $6.25 per 1M
    });

    test("calculates cost with cache read tokens", () => {
      const tokens: TokenUsage = {
        input: 0,
        output: 0,
        reasoning: 0,
        cache: { read: 1_000_000, write: 0 },
      };
      const cost = calculateCost(tokens, "claude-opus-4-5");
      expect(cost).toBe(0.5); // 1M cache read * $0.5 per 1M
    });

    test("calculates cost with reasoning tokens", () => {
      const tokens: TokenUsage = {
        input: 0,
        output: 0,
        reasoning: 1_000_000,
        cache: { read: 0, write: 0 },
      };
      const cost = calculateCost(tokens, "claude-opus-4-5");
      expect(cost).toBe(25); // reasoning uses output pricing
    });

    test("calculates combined cost with all token types", () => {
      const tokens: TokenUsage = {
        input: 1_000_000,
        output: 1_000_000,
        reasoning: 500_000,
        cache: { read: 1_000_000, write: 1_000_000 },
      };
      const cost = calculateCost(tokens, "claude-opus-4-5");
      // input: 5, output: 25, reasoning: 12.5, cache write: 6.25, cache read: 0.5
      expect(cost).toBe(49.25);
    });

    test("calculates cost for gpt-4o (no cache pricing)", () => {
      const tokens: TokenUsage = {
        input: 1_000_000,
        output: 1_000_000,
        reasoning: 0,
        cache: { read: 1_000_000, write: 1_000_000 },
      };
      const cost = calculateCost(tokens, "gpt-4o");
      // input: 2.5, output: 10, cache: 0
      expect(cost).toBe(12.5);
    });

    test("calculates cost for unknown model using default pricing", () => {
      const tokens: TokenUsage = {
        input: 1_000_000,
        output: 1_000_000,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      };
      const cost = calculateCost(tokens, "unknown-model");
      // default: input 3, output 15
      expect(cost).toBe(18);
    });

    test("handles fractional token counts", () => {
      const tokens: TokenUsage = {
        input: 500_000,
        output: 250_000,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      };
      const cost = calculateCost(tokens, "claude-opus-4-5");
      // input: 2.5, output: 6.25
      expect(cost).toBe(8.75);
    });

    test("returns zero cost for free models", () => {
      const tokens: TokenUsage = {
        input: 1_000_000,
        output: 1_000_000,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      };
      const cost = calculateCost(tokens, "qwen3-coder");
      expect(cost).toBe(0);
    });
  });
});
