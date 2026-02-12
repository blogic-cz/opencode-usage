import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { getConfigPath } from "./config.js";

const CODEX_AUTH_PATH = join(homedir(), ".codex", "auth.json");

export async function showConfig(): Promise<void> {
  const configPath = getConfigPath();
  console.log(`\nConfiguration file: ${configPath}`);

  let hasCodexAuth = false;
  try {
    const content = await readFile(CODEX_AUTH_PATH, "utf-8");
    const auth = JSON.parse(content) as { tokens?: { access_token?: string } };
    hasCodexAuth = !!auth.tokens?.access_token;
  } catch {
    // expected when ~/.codex/auth.json doesn't exist
  }

  console.log(
    `  Codex auth: ${hasCodexAuth ? "~/.codex/auth.json (auto)" : "(not found — run: codex login)"}`
  );
  console.log();
}
