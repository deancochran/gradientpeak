import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  analyze: vi.fn(),
  reconcile: vi.fn(),
}));

vi.mock("./analyze-parsed-activity-file", () => ({
  analyzeParsedActivityFile: mocks.analyze,
}));

vi.mock("../activities/reconcile-activity-evidence", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../activities/reconcile-activity-evidence")>();
  return {
    ...original,
    reconcileGeneratedActivityEvidenceWithProfileLockHeld: mocks.reconcile,
  };
});

import { replayParsedActivityFileEvidenceProfile } from "./reconcile-parsed-activity-file-evidence";

const emptyPlan = {
  effortDeleteIds: [],
  effortInserts: [],
  effortUpdates: [],
  metricDeleteIds: [],
  metricInsert: null,
  metricUpdate: null,
};

function activity(activityId: string) {
  return {
    activityId,
    activityType: "bike",
    parsedData: {
      metadata: { startTime: new Date("2026-01-01T10:00:00Z"), type: "cycling" },
      summary: { totalTime: 3_600, totalDistance: 20_000 },
      records: [],
    },
  };
}

describe("replayParsedActivityFileEvidenceProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses prior generated evidence during a chronological dry-run, then rolls it all back", async () => {
    const generatedThresholds: number[] = [];
    const generatedEfforts: string[] = [];
    const observedEvidence: Array<{ efforts: string[]; thresholds: number[] }> = [];
    const tx = { execute: vi.fn() };
    const db = {
      transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => {
        const thresholdSnapshot = [...generatedThresholds];
        const effortSnapshot = [...generatedEfforts];
        try {
          return await callback(tx);
        } catch (error) {
          generatedThresholds.splice(0, generatedThresholds.length, ...thresholdSnapshot);
          generatedEfforts.splice(0, generatedEfforts.length, ...effortSnapshot);
          throw error;
        }
      }),
    };
    mocks.analyze.mockImplementation(async (_tx, input: { activityId: string }) => {
      observedEvidence.push({
        efforts: [...generatedEfforts],
        thresholds: [...generatedThresholds],
      });
      return {
        effortsToInsert: [],
        detectedLTHR: input.activityId === "activity-1" ? 162 : 165,
        activityCompletedAt: new Date("2026-01-01T11:00:00Z"),
      };
    });
    mocks.reconcile.mockImplementation(
      async (_tx, input: { activityId: string; detectedLTHR: number | null }) => {
        generatedEfforts.push(input.activityId);
        if (input.detectedLTHR) generatedThresholds.push(input.detectedLTHR);
        return emptyPlan;
      },
    );

    const results = await replayParsedActivityFileEvidenceProfile(db as never, {
      profileId: "profile-1",
      activities: [activity("activity-1"), activity("activity-2")],
      write: false,
    });

    expect(results).toHaveLength(2);
    expect(observedEvidence).toEqual([
      { efforts: [], thresholds: [] },
      { efforts: ["activity-1"], thresholds: [162] },
    ]);
    expect(generatedThresholds).toEqual([]);
    expect(generatedEfforts).toEqual([]);
    expect(tx.execute).toHaveBeenCalledOnce();
    expect(mocks.reconcile).toHaveBeenCalledTimes(2);
  });

  it("serializes concurrent profile replays and keeps each replay in supplied order", async () => {
    const events: string[] = [];
    let releaseCurrentLock: (() => void) | undefined;
    let waitForLock = Promise.resolve();
    const db = {
      transaction: vi.fn(
        async (callback: (tx: { execute: () => Promise<void> }) => Promise<unknown>) => {
          const previousLock = waitForLock;
          waitForLock = new Promise<void>((resolve) => {
            releaseCurrentLock = resolve;
          });
          const releaseThisLock = releaseCurrentLock;
          const tx = {
            execute: vi.fn(async () => {
              await previousLock;
              events.push("lock");
            }),
          };
          try {
            return await callback(tx);
          } finally {
            releaseThisLock?.();
          }
        },
      ),
    };
    mocks.analyze.mockImplementation(async (_tx, input: { activityId: string }) => {
      events.push(`analyze:${input.activityId}`);
      await Promise.resolve();
      return {
        effortsToInsert: [],
        detectedLTHR: null,
        activityCompletedAt: new Date("2026-01-01T11:00:00Z"),
      };
    });
    mocks.reconcile.mockResolvedValue(emptyPlan);

    await Promise.all([
      replayParsedActivityFileEvidenceProfile(db as never, {
        profileId: "profile-1",
        activities: [activity("first-1"), activity("first-2")],
        write: true,
      }),
      replayParsedActivityFileEvidenceProfile(db as never, {
        profileId: "profile-1",
        activities: [activity("second-1"), activity("second-2")],
        write: true,
      }),
    ]);

    expect(events).toEqual([
      "lock",
      "analyze:first-1",
      "analyze:first-2",
      "lock",
      "analyze:second-1",
      "analyze:second-2",
    ]);
  });

  it("rolls back and propagates a profile failure", async () => {
    const persisted = ["before"];
    const tx = { execute: vi.fn() };
    const db = {
      transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => {
        const snapshot = [...persisted];
        try {
          return await callback(tx);
        } catch (error) {
          persisted.splice(0, persisted.length, ...snapshot);
          throw error;
        }
      }),
    };
    mocks.analyze.mockResolvedValue({
      effortsToInsert: [],
      detectedLTHR: null,
      activityCompletedAt: new Date("2026-01-01T11:00:00Z"),
    });
    mocks.reconcile
      .mockImplementationOnce(async () => {
        persisted.push("activity-1");
        return emptyPlan;
      })
      .mockRejectedValueOnce(new Error("reconciliation failed"));

    await expect(
      replayParsedActivityFileEvidenceProfile(db as never, {
        profileId: "profile-1",
        activities: [activity("activity-1"), activity("activity-2")],
        write: true,
      }),
    ).rejects.toThrow("reconciliation failed");
    expect(persisted).toEqual(["before"]);
  });
});
