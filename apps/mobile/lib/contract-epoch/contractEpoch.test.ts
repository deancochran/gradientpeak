import { CURRENT_CONTRACT_EPOCH } from "@repo/api/contract-epoch";
import { describe, expect, it, vi } from "vitest";
import {
  CONTRACT_EPOCH_MIGRATION_STORAGE_KEY,
  CONTRACT_EPOCH_STORAGE_KEY,
  createContractEpochInitializer,
} from "./contractEpochMigration";

type FailurePoint =
  | "prepare-journal"
  | "recording-migration"
  | "migration-journal"
  | "complete-journal"
  | "epoch-marker";

function fixture(marker: string | null, failurePoint?: FailurePoint) {
  const values = new Map<string, string>();
  const calls: string[] = [];
  let pendingFailure = failurePoint;
  if (marker !== null) values.set(CONTRACT_EPOCH_STORAGE_KEY, marker);
  const failOnce = (point: FailurePoint) => {
    if (pendingFailure !== point) return;
    pendingFailure = undefined;
    throw new Error(`interrupted:${point}`);
  };
  const migrateRecordingEvidence = vi.fn(async () => {
    calls.push("recording-migration");
    failOnce("recording-migration");
    return { quarantinedRecordingIntents: 2, quarantinedQueueJobs: 1 };
  });
  const dependencies = {
    getMarker: vi.fn(async () => values.get(CONTRACT_EPOCH_STORAGE_KEY) ?? null),
    setMarker: vi.fn(async (value: string) => {
      calls.push(`epoch-marker:${value}`);
      failOnce("epoch-marker");
      values.set(CONTRACT_EPOCH_STORAGE_KEY, value);
    }),
    getMigrationJournal: vi.fn(
      async () => values.get(CONTRACT_EPOCH_MIGRATION_STORAGE_KEY) ?? null,
    ),
    setMigrationJournal: vi.fn(async (value: string) => {
      const phase = (JSON.parse(value) as { phase: string }).phase;
      calls.push(`journal:${phase}`);
      if (phase === "prepared") failOnce("prepare-journal");
      if (phase === "recording-evidence-migrated") failOnce("migration-journal");
      if (phase === "complete") failOnce("complete-journal");
      values.set(CONTRACT_EPOCH_MIGRATION_STORAGE_KEY, value);
    }),
    migrateRecordingEvidence,
    now: () => "2026-09-10T12:00:00.000Z",
  };
  return { calls, dependencies, migrateRecordingEvidence, values };
}

describe("contract epoch initialization", () => {
  it("durably journals a non-destructive migration and writes the epoch marker last", async () => {
    const state = fixture("2");

    await expect(createContractEpochInitializer(state.dependencies)()).resolves.toBe("migrated");

    expect(state.calls).toEqual([
      "journal:prepared",
      "recording-migration",
      "journal:recording-evidence-migrated",
      "journal:complete",
      `epoch-marker:${CURRENT_CONTRACT_EPOCH}`,
    ]);
    expect(state.values.get(CONTRACT_EPOCH_STORAGE_KEY)).toBe(String(CURRENT_CONTRACT_EPOCH));
    expect(JSON.parse(state.values.get(CONTRACT_EPOCH_MIGRATION_STORAGE_KEY) ?? "null")).toEqual({
      version: 1,
      sourceEpoch: "2",
      targetEpoch: CURRENT_CONTRACT_EPOCH,
      phase: "complete",
      startedAt: "2026-09-10T12:00:00.000Z",
      completedAt: "2026-09-10T12:00:00.000Z",
      summary: { quarantinedRecordingIntents: 2, quarantinedQueueJobs: 1 },
    });
  });

  it("is a no-op when the persisted marker exactly matches", async () => {
    const state = fixture(String(CURRENT_CONTRACT_EPOCH));

    await expect(createContractEpochInitializer(state.dependencies)()).resolves.toBe("current");

    expect(state.calls).toEqual([]);
    expect(state.dependencies.getMigrationJournal).not.toHaveBeenCalled();
    expect(state.migrateRecordingEvidence).not.toHaveBeenCalled();
  });

  it.each<FailurePoint>([
    "prepare-journal",
    "recording-migration",
    "migration-journal",
    "complete-journal",
    "epoch-marker",
  ])("resumes safely after interruption at %s", async (failurePoint) => {
    const state = fixture("2", failurePoint);
    const initialize = createContractEpochInitializer(state.dependencies);

    await expect(initialize()).rejects.toThrow(`interrupted:${failurePoint}`);
    expect(state.values.get(CONTRACT_EPOCH_STORAGE_KEY)).toBe("2");
    await expect(initialize()).resolves.toBe("migrated");

    expect(state.values.get(CONTRACT_EPOCH_STORAGE_KEY)).toBe(String(CURRENT_CONTRACT_EPOCH));
    expect(JSON.parse(state.values.get(CONTRACT_EPOCH_MIGRATION_STORAGE_KEY) ?? "null").phase).toBe(
      "complete",
    );
    expect(state.migrateRecordingEvidence).toHaveBeenCalledTimes(
      failurePoint === "recording-migration" || failurePoint === "migration-journal" ? 2 : 1,
    );
  });

  it("fails closed for a malformed journal without touching recorder state or the marker", async () => {
    const state = fixture("2");
    state.values.set(CONTRACT_EPOCH_MIGRATION_STORAGE_KEY, "{not-json");

    await expect(createContractEpochInitializer(state.dependencies)()).rejects.toThrow(
      "Contract epoch migration journal is invalid",
    );

    expect(state.migrateRecordingEvidence).not.toHaveBeenCalled();
    expect(state.dependencies.setMarker).not.toHaveBeenCalled();
  });

  it.each([
    "invalid",
    String(CURRENT_CONTRACT_EPOCH + 1),
  ])("refuses an unsafe stored epoch marker %s", async (marker) => {
    const state = fixture(marker);

    await expect(createContractEpochInitializer(state.dependencies)()).rejects.toThrow(
      /Stored contract epoch/,
    );
    expect(state.migrateRecordingEvidence).not.toHaveBeenCalled();
    expect(state.dependencies.setMarker).not.toHaveBeenCalled();
  });
});
