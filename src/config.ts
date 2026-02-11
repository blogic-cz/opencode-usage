/**
 * Configuration file loader for opencode-usage
 */

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const isBun = typeof globalThis.Bun !== "undefined";

export type Config = {
  codexToken?: string;
};

export function getConfigPath(): string {
  const configDir = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  return join(configDir, "opencode-usage", "config.json");
}

export async function loadConfig(): Promise<Config> {
  try {
    const configPath = getConfigPath();
    const content = isBun
      ? await Bun.file(configPath).text()
      : await readFile(configPath, "utf-8");
    return JSON.parse(content) as Config;
  } catch {
    return {};
  }
}

export async function saveConfig(config: Config): Promise<void> {
  const configPath = getConfigPath();
  const configDir = join(configPath, "..");

  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(configDir, { recursive: true });

  const content = JSON.stringify(config, null, 2) + "\n";
  if (isBun) {
    await Bun.write(configPath, content);
  } else {
    await writeFile(configPath, content, "utf-8");
  }
}
