import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { loadRecentMessages, loadMessages } from "../loader.js";
import { join } from "node:path";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

const PERF_THRESHOLD_RECENT = 100;
const PERF_THRESHOLD_FULL = 5000;

describe("loader - performance tests (SQLite)", () => {
  let testDir: string;

  beforeAll(async () => {
    testDir = join(tmpdir(), `opencode-perf-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    const db = new Database(join(testDir, "opencode.db"));
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
    db.run(`CREATE INDEX message_session_idx ON message (session_id)`);

    const sessionsToCreate = 100;
    const msgsPerSession = 50;
    const now = Date.now();

    const insertSession = db.prepare(
      `INSERT INTO session VALUES (?, 'proj-1', 'test', '/tmp', 'Test', '1.0', ?, ?)`
    );
    const insertMsg = db.prepare(
      `INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?)`
    );

    const insertAll = db.transaction(() => {
      for (let s = 0; s < sessionsToCreate; s++) {
        const sessionId = `session-${s}`;
        insertSession.run(sessionId, now, now);

        for (let f = 0; f < msgsPerSession; f++) {
          const ageMs =
            (sessionsToCreate - s) * 1000 * 60 * 60 +
            (msgsPerSession - f) * 1000;
          const timestamp = now - ageMs;

          const data = JSON.stringify({
            role: "assistant",
            providerID: "anthropic",
            modelID: "claude-3-5-sonnet",
            tokens: {
              input: 100,
              output: 50,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
            time: { created: timestamp, completed: timestamp + 1000 },
          });

          insertMsg.run(`msg-${s}-${f}`, sessionId, timestamp, timestamp, data);
        }
      }
    });

    insertAll();
    db.close();

    console.log(
      `Created ${sessionsToCreate * msgsPerSession} test messages in ${sessionsToCreate} sessions`
    );
  });

  afterAll(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it(`loadRecentMessages() completes in under ${PERF_THRESHOLD_RECENT}ms (24 hours)`, async () => {
    const start = performance.now();
    const messages = await loadRecentMessages(testDir, 24);
    const duration = performance.now() - start;

    console.log(`loadRecentMessages(24h) took ${duration.toFixed(2)}ms`);
    console.log(`Loaded ${messages.length} messages`);

    expect(messages.length).toBeGreaterThan(0);
    expect(duration).toBeLessThan(PERF_THRESHOLD_RECENT);
  });

  it("loadRecentMessages() loads ALL messages within time window", async () => {
    const messages = await loadRecentMessages(testDir, 24);

    expect(messages.length).toBeGreaterThan(0);

    for (const msg of messages) {
      const messageTime = msg.time?.created ?? 0;
      const ageHours = (Date.now() - messageTime) / (1000 * 60 * 60);
      expect(ageHours).toBeLessThanOrEqual(24);
    }
  });

  it("loadRecentMessages() with shorter time window loads fewer messages", async () => {
    const messages24h = await loadRecentMessages(testDir, 24);
    const messages1h = await loadRecentMessages(testDir, 1);

    expect(messages1h.length).toBeLessThan(messages24h.length);
  });

  it(`loadMessages() completes in under ${PERF_THRESHOLD_FULL}ms (5000 rows)`, async () => {
    const start = performance.now();
    const messages = await loadMessages(testDir);
    const duration = performance.now() - start;

    console.log(`loadMessages() (FULL) took ${duration.toFixed(2)}ms`);
    console.log(`Loaded ${messages.length} messages`);

    expect(messages.length).toBeGreaterThan(0);
    expect(duration).toBeLessThan(PERF_THRESHOLD_FULL);
  });

  it("loadRecentMessages() is faster than loadMessages()", async () => {
    const startRecent = performance.now();
    const recentMessages = await loadRecentMessages(testDir, 24);
    const recentDuration = performance.now() - startRecent;

    const startFull = performance.now();
    const fullMessages = await loadMessages(testDir);
    const fullDuration = performance.now() - startFull;

    console.log(
      `Recent (24h): ${recentDuration.toFixed(2)}ms (${recentMessages.length} messages)`
    );
    console.log(
      `Full: ${fullDuration.toFixed(2)}ms (${fullMessages.length} messages)`
    );

    expect(recentDuration).toBeLessThan(fullDuration);
  });

  it("loadRecentMessages() with different time windows", async () => {
    const timings: Array<{ hours: number; duration: number; count: number }> =
      [];

    for (const hours of [1, 6, 12, 24]) {
      const start = performance.now();
      const messages = await loadRecentMessages(testDir, hours);
      const duration = performance.now() - start;

      timings.push({ hours, duration, count: messages.length });
    }

    console.log("\nPerformance by time window:");
    for (const timing of timings) {
      console.log(
        `  ${timing.hours}h: ${timing.duration.toFixed(2)}ms (${timing.count} messages)`
      );
    }

    for (const timing of timings) {
      expect(timing.duration).toBeLessThan(200);
    }
  });

  it("loadRecentMessages() with provider filter", async () => {
    const startWithoutFilter = performance.now();
    const withoutFilter = await loadRecentMessages(testDir, 24);
    const durationWithoutFilter = performance.now() - startWithoutFilter;

    const startWithFilter = performance.now();
    const withFilter = await loadRecentMessages(testDir, 24, "anthropic");
    const durationWithFilter = performance.now() - startWithFilter;

    console.log(
      `Without filter: ${durationWithoutFilter.toFixed(2)}ms (${withoutFilter.length} messages)`
    );
    console.log(
      `With filter: ${durationWithFilter.toFixed(2)}ms (${withFilter.length} messages)`
    );

    expect(durationWithFilter).toBeLessThan(durationWithoutFilter * 5.0);
    expect(withFilter.length).toBe(withoutFilter.length);
  });
});
