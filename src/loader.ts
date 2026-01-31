import { readdir, stat, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { MessageJson } from "./types.js";

const isBun = typeof globalThis.Bun !== "undefined";
const BATCH_SIZE = 10000;

export function getOpenCodeStoragePath(): string {
  const xdgDataHome =
    process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");
  return join(xdgDataHome, "opencode", "storage");
}

async function readJsonFile(filePath: string): Promise<MessageJson> {
  const content = isBun
    ? await Bun.file(filePath).text()
    : await readFile(filePath, "utf-8");
  return JSON.parse(content) as MessageJson;
}

async function collectFilePaths(messagesDir: string): Promise<string[]> {
  const sessionDirs = await readdir(messagesDir);

  const pathArrays = await Promise.all(
    sessionDirs.map(async (sessionDir) => {
      const sessionPath = join(messagesDir, sessionDir);
      const st = await stat(sessionPath);
      if (!st.isDirectory()) return [];

      const files = await readdir(sessionPath);
      return files
        .filter((f) => f.endsWith(".json"))
        .map((f) => join(sessionPath, f));
    })
  );

  return pathArrays.flat();
}

async function processInBatches<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  batchSize: number
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

export async function loadMessages(
  storagePath: string,
  providerFilter?: string
): Promise<MessageJson[]> {
  const messagesDir = join(storagePath, "message");

  try {
    const filePaths = await collectFilePaths(messagesDir);

    const results = await processInBatches(
      filePaths,
      async (filePath) => {
        try {
          return await readJsonFile(filePath);
        } catch {
          return null;
        }
      },
      BATCH_SIZE
    );

    return results.filter((msg): msg is MessageJson => {
      if (!msg) return false;
      if (msg.role === "user") return false;
      if (!msg.tokens) return false;

      if (providerFilter) {
        const providerId = msg.model?.providerID ?? msg.providerID ?? "unknown";
        if (providerId.toLowerCase() !== providerFilter) return false;
      }

      return true;
    });
  } catch (err) {
    console.error(`Error reading messages directory: ${err}`);
    return [];
  }
}
