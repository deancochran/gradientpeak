import { lstat, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createLocalErrorWriter } from "./local-error-log";
import { getLocalErrorLogPath, LOCAL_ERROR_LOG_DIRECTORY } from "./local-error-log-path.mjs";

const directories: string[] = [];

async function createTestLog() {
  const directory = await mkdtemp(join(tmpdir(), "gradientpeak-errors-"));
  directories.push(directory);
  return { directory, path: join(directory, "dev-errors.jsonl") };
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("local error log", () => {
  it("uses the shared absolute repository log path and rejects arbitrary overrides", () => {
    expect(getLocalErrorLogPath()).toMatch(new RegExp(`^${LOCAL_ERROR_LOG_DIRECTORY}`));
    expect(getLocalErrorLogPath(".logs/other.jsonl")).toBeNull();
    expect(getLocalErrorLogPath("/tmp/other.jsonl")).toBeNull();
  });

  it("writes only sanitized structured records with owner-only permissions", async () => {
    const { directory, path } = await createTestLog();
    const writer = createLocalErrorWriter({ enabled: true, logDirectory: directory, path });
    writer.write({
      procedure: "activities.create",
      diagnostic_category: "database",
      diagnostic_reason: "missing_column",
      sql: "SELECT private_email FROM profiles WHERE id = $1",
      params: ["550e8400-e29b-41d4-a716-446655440000"],
      health: { heartRate: 170 },
      token: "synthetic-secret",
    });
    await writer.flushForTest();

    const serialized = await readFile(path, "utf8");
    expect(serialized).toContain('"procedure":"activities.create"');
    expect(serialized).not.toMatch(/SELECT|private_email|550e8400|heartRate|synthetic-secret/);
    expect((await lstat(directory)).mode & 0o777).toBe(0o700);
    expect((await lstat(path)).mode & 0o777).toBe(0o600);
  });

  it("serializes a bounded queue and records dropped pressure as one safe summary", async () => {
    const { directory, path } = await createTestLog();
    const writer = createLocalErrorWriter({ enabled: true, logDirectory: directory, path });
    for (let index = 0; index < 250; index += 1) {
      writer.write({ diagnostic_category: "unknown", diagnostic_reason: "unexpected" });
    }
    await writer.flushForTest();

    const records = (await readFile(path, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(records.length).toBeLessThanOrEqual(101);
    expect(records.some((record) => typeof record.dropped_count === "number")).toBe(true);
  });

  it("rotates under the serialized drain and refuses symlink targets", async () => {
    const { directory, path } = await createTestLog();
    await writeFile(path, "x".repeat(1_000_000), { mode: 0o600 });
    const writer = createLocalErrorWriter({ enabled: true, logDirectory: directory, path });
    writer.write({ diagnostic_category: "unknown", diagnostic_reason: "unexpected" });
    await writer.flushForTest();
    expect((await readFile(`${path}.1`, "utf8")).length).toBe(1_000_000);

    const target = join(directory, "target.jsonl");
    await writeFile(target, "unchanged", { mode: 0o600 });
    const linkedPath = join(directory, "linked.jsonl");
    await symlink(target, linkedPath);
    const linkedWriter = createLocalErrorWriter({
      enabled: true,
      logDirectory: directory,
      path: linkedPath,
    });
    linkedWriter.write({ diagnostic_category: "unknown", diagnostic_reason: "unexpected" });
    await linkedWriter.flushForTest();
    expect(await readFile(target, "utf8")).toBe("unchanged");
  });
});
