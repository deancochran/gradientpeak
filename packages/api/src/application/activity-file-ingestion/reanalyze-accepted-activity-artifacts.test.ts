import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { ProfileAcceptedActivityArtifact } from "../../repositories/profile-accepted-activity-artifact-repository";
import {
  assertReanalysisPreservesAcceptedSource,
  type ReanalyzeProfileActivityArtifactsDependencies,
  reanalyzeProfileActivityArtifacts,
  verifyDownloadedAcceptedActivityArtifact,
} from "./reanalyze-accepted-activity-artifacts";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const bytes = new Uint8Array([1, 2, 3]);
const digest = createHash("sha256").update(bytes).digest("hex");

function uuid(index: number) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function artifact(index: number): ProfileAcceptedActivityArtifact {
  const startedAt = new Date(Date.UTC(2026, 0, 1, 0, index));
  return {
    activityId: uuid(index + 1),
    artifactId: uuid(index + 1_000),
    bucket: "activity-files",
    byteSize: bytes.byteLength,
    digest,
    finishedAt: new Date(startedAt.getTime() + 60_000),
    format: "fit",
    mediaType: "application/vnd.ant.fit",
    path: `artifacts/sha256/${PROFILE_ID}/${digest}`,
    segmentsRevision: 3,
    startedAt,
  };
}

function effort(
  method: "activity_file_best_effort" | "activity_file_lthr_detection",
  type: string,
) {
  return { method, effort_type: type };
}

function analysisFor(source: ProfileAcceptedActivityArtifact) {
  return {
    activityCompletedAt: source.finishedAt,
    activityCompletedAtIso: source.finishedAt.toISOString(),
    detectedLTHR: { valueBpm: 171 },
    effortsToInsert: [
      effort("activity_file_best_effort", "power"),
      effort("activity_file_best_effort", "speed"),
      effort("activity_file_lthr_detection", "lthr"),
    ],
    geometry: { mapBounds: null, polyline: null },
    segmentSet: {
      version: 1,
      elapsedMs: 60_000,
      segments: [
        {
          id: uuid(9_000),
          ordinal: 0,
          role: "activity",
          activity_category: "bike",
          startOffsetMs: 0,
          endOffsetMs: 60_000,
          source: {
            kind: "artifact",
            artifactId: source.artifactId,
            source: { standard: "fit", format: "fit" },
            sessionMessageIndex: 0,
            rawSport: "cycling",
          },
          summary: { timing: { timingCoverage: "complete", activeMs: 60_000, movingMs: 60_000 } },
        },
      ],
    },
    startedAt: source.startedAt,
    summaryValues: {},
  } as never;
}

function dependencies(input: {
  artifacts: ProfileAcceptedActivityArtifact[];
  inserted?: Set<string>;
}) {
  const appliedInputs: Array<
    Parameters<ReanalyzeProfileActivityArtifactsDependencies["applyArtifact"]>[0]
  > = [];
  const validateDryRun = vi.fn();
  const deps: ReanalyzeProfileActivityArtifactsDependencies = {
    listPage: vi.fn(async ({ cursor, limit }) => {
      const start = cursor
        ? input.artifacts.findIndex(({ activityId }) => activityId === cursor.activityId) + 1
        : 0;
      return input.artifacts.slice(start, start + limit);
    }),
    readVerifiedBytes: vi.fn(async () => bytes),
    analyze: vi.fn(async ({ artifact: source }) => analysisFor(source)),
    validateDryRun,
    applyArtifact: vi.fn(async (applyInput) => {
      appliedInputs.push(applyInput);
      const first = !input.inserted?.has(applyInput.artifact.activityId);
      input.inserted?.add(applyInput.artifact.activityId);
      return {
        insertedEfforts: first ? 3 : 0,
        insertedLthrEfforts: first ? 1 : 0,
        calibration: "completed" as const,
      };
    }),
  };
  return { appliedInputs, deps, validateDryRun };
}

describe("accepted activity artifact reanalysis", () => {
  it("dry-runs bounded pages, processes every activity once, and performs no writes", async () => {
    const sources = Array.from({ length: 53 }, (_, index) => artifact(index));
    const fake = dependencies({ artifacts: sources });

    const result = await reanalyzeProfileActivityArtifacts(
      {} as never,
      {} as never,
      {
        profileId: PROFILE_ID,
        apply: false,
        pageSize: 10,
      },
      fake.deps,
    );

    expect(result).toEqual({
      mode: "dry_run",
      status: "completed",
      pages: 6,
      artifactsSelected: 53,
      artifactsVerified: 53,
      artifactsAnalyzed: 53,
      generatedEfforts: 159,
      generatedLthrEfforts: 53,
      insertedEfforts: 0,
      insertedLthrEfforts: 0,
      artifactsCalibrated: 0,
      calibration: "not_requested",
      historicalDerivedStateReplay: "not_requested",
    });
    expect(fake.deps.listPage).toHaveBeenCalledTimes(6);
    expect(fake.validateDryRun).toHaveBeenCalledTimes(53);
    expect(fake.deps.applyArtifact).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty("profileId");
    expect(result).not.toHaveProperty("artifacts");
  });

  it("requires exact apply confirmation before any read or write", async () => {
    const fake = dependencies({ artifacts: [artifact(0)] });

    await expect(
      reanalyzeProfileActivityArtifacts(
        {} as never,
        {} as never,
        { profileId: PROFILE_ID, apply: true },
        fake.deps,
      ),
    ).rejects.toThrow("exactly matches");
    expect(fake.deps.listPage).not.toHaveBeenCalled();
    expect(fake.deps.applyArtifact).not.toHaveBeenCalled();
  });

  it("replays idempotently and calibrates LTHR alongside power and speed per artifact", async () => {
    const sources = [artifact(0), artifact(1)];
    const inserted = new Set<string>();
    const first = dependencies({ artifacts: sources, inserted });
    const input = {
      profileId: PROFILE_ID,
      apply: true,
      confirmProfileId: PROFILE_ID,
      now: new Date("2026-02-01T00:00:00.000Z"),
    } as const;

    const firstResult = await reanalyzeProfileActivityArtifacts(
      {} as never,
      {} as never,
      input,
      first.deps,
    );
    expect(firstResult).toMatchObject({
      insertedEfforts: 6,
      insertedLthrEfforts: 2,
      artifactsCalibrated: 2,
      calibration: "completed",
      historicalDerivedStateReplay: "pending_existing_command",
    });
    expect(first.appliedInputs).toHaveLength(2);
    expect(
      first.appliedInputs[0]?.analysis.effortsToInsert.map((item) => item.effort_type),
    ).toEqual(["power", "speed", "lthr"]);

    const second = dependencies({ artifacts: sources, inserted });
    await expect(
      reanalyzeProfileActivityArtifacts({} as never, {} as never, input, second.deps),
    ).resolves.toMatchObject({
      insertedEfforts: 0,
      insertedLthrEfforts: 0,
      artifactsCalibrated: 2,
      calibration: "completed",
    });
  });

  it("can rerun after interruption without leaving an already-applied artifact uncalibrated", async () => {
    const sources = [artifact(0), artifact(1)];
    const inserted = new Set<string>();
    const calibrated = new Set<string>();
    let interrupt = true;
    const fake = dependencies({ artifacts: sources, inserted });
    fake.deps.applyArtifact = vi.fn(async ({ artifact: source }) => {
      if (source.activityId === sources[1]?.activityId && interrupt) {
        interrupt = false;
        throw new Error("interrupted");
      }
      const first = !inserted.has(source.activityId);
      inserted.add(source.activityId);
      calibrated.add(source.activityId);
      return {
        insertedEfforts: first ? 3 : 0,
        insertedLthrEfforts: first ? 1 : 0,
        calibration: "completed" as const,
      };
    });
    const input = {
      profileId: PROFILE_ID,
      apply: true,
      confirmProfileId: PROFILE_ID,
    } as const;

    await expect(
      reanalyzeProfileActivityArtifacts({} as never, {} as never, input, fake.deps),
    ).rejects.toThrow("interrupted");
    expect(inserted).toEqual(new Set([sources[0]?.activityId]));
    expect(calibrated).toEqual(new Set([sources[0]?.activityId]));

    await expect(
      reanalyzeProfileActivityArtifacts({} as never, {} as never, input, fake.deps),
    ).resolves.toMatchObject({
      artifactsCalibrated: 2,
      calibration: "completed",
    });
    expect(calibrated).toEqual(new Set(sources.map(({ activityId }) => activityId)));
  });

  it("fails closed when downloaded bytes disagree with stored digest or size", () => {
    const source = artifact(0);
    expect(() =>
      verifyDownloadedAcceptedActivityArtifact({
        artifact: source,
        bytes: new Uint8Array([9, 9, 9]),
        profileId: PROFILE_ID,
      }),
    ).toThrow("digest or size verification failed");
    expect(() =>
      verifyDownloadedAcceptedActivityArtifact({
        artifact: { ...source, byteSize: 4 },
        bytes,
        profileId: PROFILE_ID,
      }),
    ).toThrow("digest or size verification failed");
  });

  it("refuses replay that would alter immutable parent or segment identity", () => {
    const source = artifact(0);
    const analysis = analysisFor(source);
    const current = {
      startedAt: source.startedAt,
      finishedAt: source.finishedAt,
      segmentsRevision: 3,
      segments: [
        {
          id: uuid(9_000),
          ordinal: 0,
          role: "activity" as const,
          activityCategory: "bike" as const,
          startOffsetMs: 0,
          endOffsetMs: 60_000,
          segmentRevision: 3,
          sourceArtifactId: source.artifactId,
          sourceMessageIndex: null,
          sourceSessionIndex: 0,
          rawTypeString: null,
          rawTypeInteger: null,
          rawSportString: "cycling",
          rawSportInteger: null,
          rawSubSportString: null,
          rawSubSportInteger: null,
        },
      ],
    };
    const persistedSegment = current.segments[0];
    if (!persistedSegment) throw new Error("Expected persisted segment fixture");
    expect(() => assertReanalysisPreservesAcceptedSource(current, source, analysis)).not.toThrow();
    expect(() =>
      assertReanalysisPreservesAcceptedSource(
        { ...current, segments: [{ ...persistedSegment, endOffsetMs: 59_000 }] },
        source,
        analysis,
      ),
    ).toThrow("segment identity");
  });
});
