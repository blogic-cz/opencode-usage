/**
 * Config management commands
 */

import { loadConfig, saveConfig, getConfigPath } from "./config.js";

export async function setCodexToken(token: string): Promise<void> {
  const config = await loadConfig();
  config.codexToken = token;
  await saveConfig(config);
  console.log(`✓ Codex token saved to ${getConfigPath()}`);
}

export async function showConfig(): Promise<void> {
  const config = await loadConfig();
  const configPath = getConfigPath();

  console.log(`\nConfiguration file: ${configPath}\n`);

  if (config.codexToken) {
    const maskedToken =
      config.codexToken.substring(0, 8) +
      "..." +
      config.codexToken.substring(config.codexToken.length - 4);
    console.log(`  codexToken: ${maskedToken}`);
  } else {
    console.log(`  codexToken: (not set)`);
  }

  console.log();
}
