import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createCursor, loadMessagesIncremental } from "../loader.js";
import type { MessageJson } from "../types.js";
import { join } from "node:path";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

function createTestDb(dir: string): Database {
  const db = new Database(join(dir, "opencode.db"));
  db.run(`CREATE TABLE session (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    slug TEXT NOT NULL,
    directory TEXT NOT NULL,
    title TEXT NOT NULL,
    version TEXT NOT NULL,
    time_created INTEGER NOT NULL,
    time_updated INTEGER NOT NULL
  )`);
  db.run(`CREATE TABLE message (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    time_created INTEGER NOT NULL,
    time_updated INTEGER NOT NULL,
    data TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES session(id)
  )`);
  db.run(
    `INSERT INTO session VALUES ('ses-1', 'proj-1', 'test', '/tmp', 'Test', '1.0', 0, 0)`
  );
  db.run(
    `INSERT INTO session VALUES ('ses-2', 'proj-1', 'test2', '/tmp', 'Test2', '1.0', 0, 0)`
  );
  return db;
}

function insertMessage(
  db: Database,
  id: string,
  sessionId: string,
  data: Omit<MessageJson, "id" | "sessionID">,
  timeCreated?: number
) {
  const ts = timeCreated ?? data.time?.created ?? Date.now();
  db.run(
    `INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?)`,
    [id, sessionId, ts, ts, JSON.stringify(data)]
  );
}

const assistantData = (
  providerID: string = "anthropic",
  created: number = Date.now()
): Omit<MessageJson, "id" | "sessionID"> => ({
  role: "assistant",
  model: { providerID, modelID: "claude-3-5-sonnet" },
  tokens: {
    input: 100,
    output: 50,
    reasoning: 0,
    cache: { read: 0, write: 0 },
  },
  time: { created, completed: created + 1000 },
});

describe("loader - incremental loading (SQLite)", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `opencode-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("createCursor() returns empty state", () => {
    const cursor = createCursor();
    expect(cursor.lastTimestamp).toBe(0);
  });

  it("loadMessagesIncremental() on first call loads all messages", async () => {
    const db = createTestDb(testDir);
    insertMessage(db, "msg-1", "ses-1", assistantData("anthropic", 1000), 1000);
    insertMessage(db, "msg-2", "ses-1", assistantData("anthropic", 2000), 2000);
    db.close();

    const cursor = createCursor();
    const result = await loadMessagesIncremental(testDir, cursor);

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].id).toBe("msg-1");
    expect(result.messages[1].id).toBe("msg-2");
    expect(result.cursor.lastTimestamp).toBe(2000);
  });

  it("loadMessagesIncremental() on second call returns only NEW messages", async () => {
    const db = createTestDb(testDir);
    insertMessage(db, "msg-1", "ses-1", assistantData("anthropic", 1000), 1000);
    insertMessage(db, "msg-2", "ses-1", assistantData("anthropic", 2000), 2000);

    const cursor = createCursor();
    const result1 = await loadMessagesIncremental(testDir, cursor);
    expect(result1.messages).toHaveLength(2);

    insertMessage(db, "msg-3", "ses-1", assistantData("anthropic", 3000), 3000);
    db.close();

    const result2 = await loadMessagesIncremental(testDir, result1.cursor);

    expect(result2.messages).toHaveLength(1);
    expect(result2.messages[0].id).toBe("msg-3");
    expect(result2.cursor.lastTimestamp).toBe(3000);
  });

  it("loadMessagesIncremental() handles multiple sessions", async () => {
    const db = createTestDb(testDir);
    insertMessage(db, "msg-1", "ses-1", assistantData("anthropic", 1000), 1000);
    insertMessage(db, "msg-2", "ses-2", assistantData("openai", 2000), 2000);
    db.close();

    const cursor = createCursor();
    const result = await loadMessagesIncremental(testDir, cursor);

    expect(result.messages).toHaveLength(2);
    expect(result.messages.map((m) => m.sessionID).sort()).toEqual([
      "ses-1",
      "ses-2",
    ]);
  });

  it("loadMessagesIncremental() respects provider filter", async () => {
    const db = createTestDb(testDir);
    insertMessage(db, "msg-1", "ses-1", assistantData("anthropic", 1000), 1000);
    insertMessage(db, "msg-2", "ses-1", assistantData("openai", 2000), 2000);
    db.close();

    const cursor = createCursor();
    const result = await loadMessagesIncremental(testDir, cursor, "anthropic");

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].id).toBe("msg-1");
  });

  it("loadMessagesIncremental() skips user messages", async () => {
    const db = createTestDb(testDir);
    const userData: Omit<MessageJson, "id" | "sessionID"> = {
      role: "user",
      tokens: {
        input: 100,
        output: 0,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
    };
    insertMessage(db, "user-1", "ses-1", userData, 1000);
    insertMessage(
      db,
      "asst-1",
      "ses-1",
      assistantData("anthropic", 2000),
      2000
    );
    db.close();

    const cursor = createCursor();
    const result = await loadMessagesIncremental(testDir, cursor);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].id).toBe("asst-1");
  });

  it("loadMessagesIncremental() skips messages without tokens", async () => {
    const db = createTestDb(testDir);
    const noTokensData: Omit<MessageJson, "id" | "sessionID"> = {
      role: "assistant",
      model: { providerID: "anthropic", modelID: "claude-3-5-sonnet" },
    };
    insertMessage(db, "no-tokens", "ses-1", noTokensData, 1000);
    insertMessage(
      db,
      "with-tokens",
      "ses-1",
      assistantData("anthropic", 2000),
      2000
    );
    db.close();

    const cursor = createCursor();
    const result = await loadMessagesIncremental(testDir, cursor);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].id).toBe("with-tokens");
  });

  it("loadMessagesIncremental() handles empty database", async () => {
    const db = createTestDb(testDir);
    db.close();

    const cursor = createCursor();
    const result = await loadMessagesIncremental(testDir, cursor);

    expect(result.messages).toHaveLength(0);
  });

  it("loadMessagesIncremental() updates lastTimestamp to max", async () => {
    const db = createTestDb(testDir);
    insertMessage(db, "msg-1", "ses-1", assistantData("anthropic", 1000), 1000);
    insertMessage(db, "msg-2", "ses-1", assistantData("anthropic", 5000), 5000);
    insertMessage(db, "msg-3", "ses-1", assistantData("anthropic", 3000), 3000);
    db.close();

    const cursor = createCursor();
    const result = await loadMessagesIncremental(testDir, cursor);

    expect(result.cursor.lastTimestamp).toBe(5000);
  });

  it("loadMessagesIncremental() handles missing database gracefully", async () => {
    const cursor = createCursor();
    const result = await loadMessagesIncremental(testDir, cursor);

    expect(result.messages).toHaveLength(0);
    expect(result.cursor.lastTimestamp).toBe(0);
  });

  it("reconstructs id and sessionID from table columns", async () => {
    const db = createTestDb(testDir);
    insertMessage(
      db,
      "msg-abc",
      "ses-1",
      assistantData("anthropic", 1000),
      1000
    );
    db.close();

    const cursor = createCursor();
    const result = await loadMessagesIncremental(testDir, cursor);

    expect(result.messages[0].id).toBe("msg-abc");
    expect(result.messages[0].sessionID).toBe("ses-1");
  });
});
