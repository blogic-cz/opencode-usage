import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createCursor, loadMessagesIncremental } from "../loader.js";
import type { MessageJson } from "../types.js";
import { join } from "node:path";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

// Test fixtures
const createTestMessage = (
  id: string,
  sessionID: string,
  providerID: string = "anthropic",
  created: number = Date.now()
): MessageJson => ({
  id,
  sessionID,
  role: "assistant",
  model: {
    providerID,
    modelID: "claude-3-5-sonnet",
  },
  tokens: {
    input: 100,
    output: 50,
    reasoning: 0,
    cache: { read: 0, write: 0 },
  },
  time: {
    created,
    completed: created + 1000,
  },
});

describe("loader - incremental loading", () => {
  let testDir: string;

  beforeEach(async () => {
    // Create temporary test directory
    testDir = join(tmpdir(), `opencode-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("createCursor() returns empty state", () => {
    const cursor = createCursor();

    expect(cursor.knownSessions).toBeInstanceOf(Set);
    expect(cursor.knownSessions.size).toBe(0);
    expect(cursor.fileCountPerSession).toBeInstanceOf(Map);
    expect(cursor.fileCountPerSession.size).toBe(0);
    expect(cursor.lastTimestamp).toBe(0);
  });

  it("loadMessagesIncremental() on first call loads all files", async () => {
    // Setup: Create message files
    const messagesDir = join(testDir, "message");
    const session1Dir = join(messagesDir, "session-1");
    await mkdir(session1Dir, { recursive: true });

    const msg1 = createTestMessage("msg-1", "session-1", "anthropic", 1000);
    const msg2 = createTestMessage("msg-2", "session-1", "anthropic", 2000);

    await writeFile(join(session1Dir, "msg-1.json"), JSON.stringify(msg1));
    await writeFile(join(session1Dir, "msg-2.json"), JSON.stringify(msg2));

    // Execute: Load with empty cursor
    const cursor = createCursor();
    const result = await loadMessagesIncremental(testDir, cursor);

    // Verify: All messages loaded
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].id).toBe("msg-1");
    expect(result.messages[1].id).toBe("msg-2");

    // Verify: Cursor updated
    expect(result.cursor.knownSessions.has("session-1")).toBe(true);
    expect(result.cursor.fileCountPerSession.get("session-1")).toBe(2);
    expect(result.cursor.lastTimestamp).toBe(2000);
  });

  it("loadMessagesIncremental() on second call returns only NEW files", async () => {
    // Setup: Create initial files
    const messagesDir = join(testDir, "message");
    const session1Dir = join(messagesDir, "session-1");
    await mkdir(session1Dir, { recursive: true });

    const msg1 = createTestMessage("msg-1", "session-1", "anthropic", 1000);
    const msg2 = createTestMessage("msg-2", "session-1", "anthropic", 2000);

    await writeFile(join(session1Dir, "msg-1.json"), JSON.stringify(msg1));
    await writeFile(join(session1Dir, "msg-2.json"), JSON.stringify(msg2));

    // First load
    const cursor1 = createCursor();
    const result1 = await loadMessagesIncremental(testDir, cursor1);
    expect(result1.messages).toHaveLength(2);

    // Add new file
    const msg3 = createTestMessage("msg-3", "session-1", "anthropic", 3000);
    await writeFile(join(session1Dir, "msg-3.json"), JSON.stringify(msg3));

    // Second load with updated cursor
    const result2 = await loadMessagesIncremental(testDir, result1.cursor);

    // Verify: Only new message returned
    expect(result2.messages).toHaveLength(1);
    expect(result2.messages[0].id).toBe("msg-3");
    expect(result2.cursor.fileCountPerSession.get("session-1")).toBe(3);
    expect(result2.cursor.lastTimestamp).toBe(3000);
  });

  it("loadMessagesIncremental() handles multiple sessions", async () => {
    // Setup: Create files in multiple sessions
    const messagesDir = join(testDir, "message");
    const session1Dir = join(messagesDir, "session-1");
    const session2Dir = join(messagesDir, "session-2");
    await mkdir(session1Dir, { recursive: true });
    await mkdir(session2Dir, { recursive: true });

    const msg1 = createTestMessage("msg-1", "session-1", "anthropic", 1000);
    const msg2 = createTestMessage("msg-2", "session-2", "openai", 2000);

    await writeFile(join(session1Dir, "msg-1.json"), JSON.stringify(msg1));
    await writeFile(join(session2Dir, "msg-2.json"), JSON.stringify(msg2));

    // Load
    const cursor = createCursor();
    const result = await loadMessagesIncremental(testDir, cursor);

    // Verify: Both sessions tracked
    expect(result.messages).toHaveLength(2);
    expect(result.cursor.knownSessions.has("session-1")).toBe(true);
    expect(result.cursor.knownSessions.has("session-2")).toBe(true);
    expect(result.cursor.fileCountPerSession.get("session-1")).toBe(1);
    expect(result.cursor.fileCountPerSession.get("session-2")).toBe(1);
  });

  it("loadMessagesIncremental() respects provider filter", async () => {
    // Setup: Create files with different providers
    const messagesDir = join(testDir, "message");
    const session1Dir = join(messagesDir, "session-1");
    await mkdir(session1Dir, { recursive: true });

    const msg1 = createTestMessage("msg-1", "session-1", "anthropic", 1000);
    const msg2 = createTestMessage("msg-2", "session-1", "openai", 2000);

    await writeFile(join(session1Dir, "msg-1.json"), JSON.stringify(msg1));
    await writeFile(join(session1Dir, "msg-2.json"), JSON.stringify(msg2));

    // Load with filter
    const cursor = createCursor();
    const result = await loadMessagesIncremental(testDir, cursor, "anthropic");

    // Verify: Only anthropic messages returned
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].id).toBe("msg-1");
  });

  it("loadMessagesIncremental() skips user messages", async () => {
    // Setup: Create user and assistant messages
    const messagesDir = join(testDir, "message");
    const session1Dir = join(messagesDir, "session-1");
    await mkdir(session1Dir, { recursive: true });

    const userMsg: MessageJson = {
      id: "user-1",
      sessionID: "session-1",
      role: "user",
      tokens: {
        input: 100,
        output: 0,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
    };

    const assistantMsg = createTestMessage(
      "asst-1",
      "session-1",
      "anthropic",
      1000
    );

    await writeFile(join(session1Dir, "user-1.json"), JSON.stringify(userMsg));
    await writeFile(
      join(session1Dir, "asst-1.json"),
      JSON.stringify(assistantMsg)
    );

    // Load
    const cursor = createCursor();
    const result = await loadMessagesIncremental(testDir, cursor);

    // Verify: Only assistant message returned
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].id).toBe("asst-1");
  });

  it("loadMessagesIncremental() skips messages without tokens", async () => {
    // Setup: Create message without tokens
    const messagesDir = join(testDir, "message");
    const session1Dir = join(messagesDir, "session-1");
    await mkdir(session1Dir, { recursive: true });

    const msgNoTokens: MessageJson = {
      id: "no-tokens",
      sessionID: "session-1",
      role: "assistant",
      model: {
        providerID: "anthropic",
        modelID: "claude-3-5-sonnet",
      },
    };

    const msgWithTokens = createTestMessage(
      "with-tokens",
      "session-1",
      "anthropic",
      1000
    );

    await writeFile(
      join(session1Dir, "no-tokens.json"),
      JSON.stringify(msgNoTokens)
    );
    await writeFile(
      join(session1Dir, "with-tokens.json"),
      JSON.stringify(msgWithTokens)
    );

    // Load
    const cursor = createCursor();
    const result = await loadMessagesIncremental(testDir, cursor);

    // Verify: Only message with tokens returned
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].id).toBe("with-tokens");
  });

  it("loadMessagesIncremental() handles invalid JSON gracefully", async () => {
    // Setup: Create valid and invalid JSON files
    const messagesDir = join(testDir, "message");
    const session1Dir = join(messagesDir, "session-1");
    await mkdir(session1Dir, { recursive: true });

    const validMsg = createTestMessage("valid", "session-1", "anthropic", 1000);

    await writeFile(join(session1Dir, "valid.json"), JSON.stringify(validMsg));
    await writeFile(join(session1Dir, "invalid.json"), "{ invalid json");

    // Load
    const cursor = createCursor();
    const result = await loadMessagesIncremental(testDir, cursor);

    // Verify: Only valid message returned, no error thrown
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].id).toBe("valid");
  });

  it("loadMessagesIncremental() does not re-read previously processed files", async () => {
    // Setup: Create initial files
    const messagesDir = join(testDir, "message");
    const session1Dir = join(messagesDir, "session-1");
    await mkdir(session1Dir, { recursive: true });

    const msg1 = createTestMessage("msg-1", "session-1", "anthropic", 1000);
    const msg2 = createTestMessage("msg-2", "session-1", "anthropic", 2000);

    await writeFile(join(session1Dir, "msg-1.json"), JSON.stringify(msg1));
    await writeFile(join(session1Dir, "msg-2.json"), JSON.stringify(msg2));

    // First load
    const cursor1 = createCursor();
    const result1 = await loadMessagesIncremental(testDir, cursor1);
    expect(result1.messages).toHaveLength(2);

    // Modify first file (simulate file change)
    const modifiedMsg1 = createTestMessage(
      "msg-1-modified",
      "session-1",
      "anthropic",
      1500
    );
    await writeFile(
      join(session1Dir, "msg-1.json"),
      JSON.stringify(modifiedMsg1)
    );

    // Add new file
    const msg3 = createTestMessage("msg-3", "session-1", "anthropic", 3000);
    await writeFile(join(session1Dir, "msg-3.json"), JSON.stringify(msg3));

    // Second load
    const result2 = await loadMessagesIncremental(testDir, result1.cursor);

    // Verify: Only new file returned, modified file not re-read
    expect(result2.messages).toHaveLength(1);
    expect(result2.messages[0].id).toBe("msg-3");
    expect(result2.messages.some((m) => m.id === "msg-1-modified")).toBe(false);
  });

  it("loadMessagesIncremental() handles empty directory", async () => {
    // Setup: Create empty message directory
    const messagesDir = join(testDir, "message");
    await mkdir(messagesDir, { recursive: true });

    // Load
    const cursor = createCursor();
    const result = await loadMessagesIncremental(testDir, cursor);

    // Verify: Empty result, no error
    expect(result.messages).toHaveLength(0);
    expect(result.cursor.knownSessions.size).toBe(0);
  });

  it("loadMessagesIncremental() updates lastTimestamp correctly", async () => {
    // Setup: Create files with different timestamps
    const messagesDir = join(testDir, "message");
    const session1Dir = join(messagesDir, "session-1");
    await mkdir(session1Dir, { recursive: true });

    const msg1 = createTestMessage("msg-1", "session-1", "anthropic", 1000);
    const msg2 = createTestMessage("msg-2", "session-1", "anthropic", 5000);
    const msg3 = createTestMessage("msg-3", "session-1", "anthropic", 3000);

    await writeFile(join(session1Dir, "msg-1.json"), JSON.stringify(msg1));
    await writeFile(join(session1Dir, "msg-2.json"), JSON.stringify(msg2));
    await writeFile(join(session1Dir, "msg-3.json"), JSON.stringify(msg3));

    // Load
    const cursor = createCursor();
    const result = await loadMessagesIncremental(testDir, cursor);

    // Verify: lastTimestamp is the maximum
    expect(result.cursor.lastTimestamp).toBe(5000);
  });
});
