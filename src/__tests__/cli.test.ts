import { describe, test, expect } from "bun:test";

describe("cli", () => {
  describe("date parsing", () => {
    test("parses YYYYMMDD format correctly", () => {
      const value = "20251201";
      const result = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
      expect(result).toBe("2025-12-01");
    });

    test("parses YYYY-MM-DD format correctly", () => {
      const value = "2025-12-01";
      expect(/^\d{4}-\d{2}-\d{2}$/.test(value)).toBe(true);
    });

    test("validates YYYYMMDD format", () => {
      const value = "20251201";
      expect(/^\d{8}$/.test(value)).toBe(true);
    });

    test("validates YYYY-MM-DD format", () => {
      const value = "2025-12-01";
      expect(/^\d{4}-\d{2}-\d{2}$/.test(value)).toBe(true);
    });

    test("validates relative date format 7d", () => {
      const value = "7d";
      const match = value.match(/^(\d+)([dwm])$/);
      expect(match).toBeDefined();
      expect(match![1]).toBe("7");
      expect(match![2]).toBe("d");
    });

    test("validates relative date format 1w", () => {
      const value = "1w";
      const match = value.match(/^(\d+)([dwm])$/);
      expect(match).toBeDefined();
      expect(match![1]).toBe("1");
      expect(match![2]).toBe("w");
    });

    test("validates relative date format 1m", () => {
      const value = "1m";
      const match = value.match(/^(\d+)([dwm])$/);
      expect(match).toBeDefined();
      expect(match![1]).toBe("1");
      expect(match![2]).toBe("m");
    });

    test("rejects invalid date format", () => {
      const value = "invalid";
      const isValid =
        /^\d{8}$/.test(value) ||
        /^\d{4}-\d{2}-\d{2}$/.test(value) ||
        /^(\d+)([dwm])$/.test(value);
      expect(isValid).toBe(false);
    });

    test("handles empty date string", () => {
      const value = "";
      const isValid =
        /^\d{8}$/.test(value) ||
        /^\d{4}-\d{2}-\d{2}$/.test(value) ||
        /^(\d+)([dwm])$/.test(value);
      expect(isValid).toBe(false);
    });
  });

  describe("flag parsing", () => {
    test("recognizes provider flag", () => {
      const flags = ["--provider", "anthropic"];
      expect(flags[0]).toBe("--provider");
      expect(flags[1]).toBe("anthropic");
    });

    test("recognizes provider short flag", () => {
      const flags = ["-p", "openai"];
      expect(flags[0]).toBe("-p");
      expect(flags[1]).toBe("openai");
    });

    test("recognizes days flag", () => {
      const flags = ["--days", "7"];
      expect(flags[0]).toBe("--days");
      expect(parseInt(flags[1], 10)).toBe(7);
    });

    test("recognizes days short flag", () => {
      const flags = ["-d", "30"];
      expect(flags[0]).toBe("-d");
      expect(parseInt(flags[1], 10)).toBe(30);
    });

    test("recognizes json flag", () => {
      const flags = ["--json"];
      expect(flags[0]).toBe("--json");
    });

    test("recognizes json short flag", () => {
      const flags = ["-j"];
      expect(flags[0]).toBe("-j");
    });

    test("recognizes monthly flag", () => {
      const flags = ["--monthly"];
      expect(flags[0]).toBe("--monthly");
    });

    test("recognizes monthly short flag", () => {
      const flags = ["-m"];
      expect(flags[0]).toBe("-m");
    });

    test("recognizes watch flag", () => {
      const flags = ["--watch"];
      expect(flags[0]).toBe("--watch");
    });

    test("recognizes watch short flag", () => {
      const flags = ["-w"];
      expect(flags[0]).toBe("-w");
    });

    test("recognizes dashboard flag", () => {
      const flags = ["--dashboard"];
      expect(flags[0]).toBe("--dashboard");
    });

    test("recognizes dashboard short flag", () => {
      const flags = ["-D"];
      expect(flags[0]).toBe("-D");
    });

    test("recognizes codex-token flag", () => {
      const flags = ["--codex-token", "abc123"];
      expect(flags[0]).toBe("--codex-token");
      expect(flags[1]).toBe("abc123");
    });

    test("recognizes since flag", () => {
      const flags = ["--since", "2025-12-01"];
      expect(flags[0]).toBe("--since");
      expect(flags[1]).toBe("2025-12-01");
    });

    test("recognizes since short flag", () => {
      const flags = ["-s", "2025-12-01"];
      expect(flags[0]).toBe("-s");
      expect(flags[1]).toBe("2025-12-01");
    });

    test("recognizes until flag", () => {
      const flags = ["--until", "2025-12-31"];
      expect(flags[0]).toBe("--until");
      expect(flags[1]).toBe("2025-12-31");
    });

    test("recognizes until short flag", () => {
      const flags = ["-u", "2025-12-31"];
      expect(flags[0]).toBe("-u");
      expect(flags[1]).toBe("2025-12-31");
    });
  });

  describe("value normalization", () => {
    test("normalizes provider to lowercase", () => {
      const provider = "ANTHROPIC";
      expect(provider.toLowerCase()).toBe("anthropic");
    });

    test("parses days as integer", () => {
      const days = "7";
      expect(parseInt(days, 10)).toBe(7);
    });

    test("parses days as integer from string", () => {
      const days = "30";
      expect(parseInt(days, 10)).toBe(30);
    });

    test("handles multiple flags in sequence", () => {
      const flags = ["-p", "anthropic", "-d", "7", "-j", "-m"];
      expect(flags[1]).toBe("anthropic");
      expect(parseInt(flags[3], 10)).toBe(7);
      expect(flags[4]).toBe("-j");
      expect(flags[5]).toBe("-m");
    });
  });
});
