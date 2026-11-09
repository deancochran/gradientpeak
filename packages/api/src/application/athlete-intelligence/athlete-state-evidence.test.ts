import { ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION } from "@repo/core/athlete-derived-state";
import { activities, activityAnalysisRevisions, activitySegments } from "@repo/db";
import { describe, expect, it, vi } from "vitest";
import {
  hasEquivalentActivityTrainingEffectContent,
  materializeActivityAthleteStateEvidence,
  resolveAthleteStateMaterialEffectiveAt,
  resolveAthleteStateMaterialEligibilityAt,
} from "./athlete-state-evidence";

describe("resolveAthleteStateMaterialEffectiveAt", () => {
  it("waits for a future parent activity when its effort was recorded earlier", () => {
    const activityFinishedAt = new Date("2026-08-08T10:00:00.000Z");

    expect(
      resolveAthleteStateMaterialEffectiveAt({
        activityFinishedAt,
        activityMaterialChanged: false,
        effortMaterialRecordedAt: new Date("2026-08-07T10:00:00.000Z"),
      }),
    ).toEqual(activityFinishedAt);
  });

  it("preserves a future effort boundary on an already-finished activity", () => {
    const effortMaterialRecordedAt = new Date("2026-08-08T10:00:00.000Z");

    expect(
      resolveAthleteStateMaterialEffectiveAt({
        activityFinishedAt: new Date("2026-08-01T10:00:00.000Z"),
        activityMaterialChanged: false,
        effortMaterialRecordedAt,
      }),
    ).toEqual(effortMaterialRecordedAt);
  });

  it("keeps an independently due activity change ahead of later effort evidence", () => {
    const activityFinishedAt = new Date("2026-08-01T10:00:00.000Z");

    expect(
      resolveAthleteStateMaterialEffectiveAt({
        activityFinishedAt,
        activityMaterialChanged: true,
        effortMaterialRecordedAt: new Date("2026-08-08T10:00:00.000Z"),
      }),
    ).toEqual(activityFinishedAt);
  });

  it("uses the later effort boundary only for claim eligibility, not replay start", () => {
    const activityFinishedAt = new Date("2026-08-01T10:00:00.000Z");
    const effortRecordedAt = new Date("2026-08-08T10:00:00.000Z");

    expect(
      resolveAthleteStateMaterialEffectiveAt({
        activityFinishedAt,
        activityMaterialChanged: true,
        effortMaterialRecordedAt: effortRecordedAt,
      }),
    ).toEqual(activityFinishedAt);
    expect(
      resolveAthleteStateMaterialEligibilityAt({
        activityFinishedAt,
        activityMaterialChanged: true,
        effortMaterialRecordedAt: effortRecordedAt,
      }),
    ).toEqual(effortRecordedAt);
  });

  it("uses an effort-only boundary for both replay and eligibility", () => {
    const activityFinishedAt = new Date("2026-08-01T10:00:00.000Z");
    const effortRecordedAt = new Date("2026-08-08T10:00:00.000Z");

    expect(
      resolveAthleteStateMaterialEffectiveAt({
        activityFinishedAt,
        activityMaterialChanged: false,
        effortMaterialRecordedAt: effortRecordedAt,
      }),
    ).toEqual(effortRecordedAt);
    expect(
      resolveAthleteStateMaterialEligibilityAt({
        activityFinishedAt,
        activityMaterialChanged: false,
        effortMaterialRecordedAt: effortRecordedAt,
      }),
    ).toEqual(effortRecordedAt);
  });
});

describe("hasEquivalentActivityTrainingEffectContent", () => {
  const effect = {
    contractVersion: ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION,
    profileId: "11111111-1111-4111-8111-111111111111",
    activityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    activityAnalysisRevision: 1,
    effectiveAt: "2026-08-01T10:00:00.000Z",
    planningDate: "2026-08-01",
    sourceRevision: 1,
    calculationVersion: "effect-v1",
    inputFingerprint: "a".repeat(64),
    stimulus: {
      kind: "observed" as const,
      sourceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      occurredAt: "2026-08-01T10:00:00.000Z",
      activityCategory: "bike" as const,
      commonLoad: 42,
      evidenceConfidence: 0.9,
      capabilityObservation: { distanceMeters: 10_000, durationMinutes: 60 },
    },
  };

  it("accepts only a source-generation change for an immutable canonical effect", () => {
    expect(
      hasEquivalentActivityTrainingEffectContent(effect, {
        ...effect,
        sourceRevision: 2,
        stimulus: {
          ...effect.stimulus,
          capabilityObservation: { durationMinutes: 60, distanceMeters: 10_000 },
        },
      }),
    ).toBe(true);
  });

  it("does not hide a changed canonical stimulus behind a source-generation change", () => {
    expect(
      hasEquivalentActivityTrainingEffectContent(effect, {
        ...effect,
        sourceRevision: 2,
        stimulus: { ...effect.stimulus, commonLoad: 43 },
      }),
    ).toBe(false);
  });
});

describe("materializeActivityAthleteStateEvidence", () => {
  it("clears every stale athlete-state projection when current summaries are empty", async () => {
    const profileId = "11111111-1111-4111-8111-111111111111";
    const activityId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const finishedAt = new Date("2026-08-01T10:00:00.000Z");
    const staleActivity = {
      id: activityId,
      profile_id: profileId,
      finished_at: finishedAt,
      segments_revision: 3,
      athlete_state_common_load: 42,
      athlete_state_activity_category: "run",
      athlete_state_evidence_confidence: 0.95,
      athlete_state_capability_distance_meters: 10_000,
      athlete_state_capability_duration_minutes: 60,
      athlete_state_input_version: "canonical-activity-state-v1",
      athlete_state_computed_at: new Date("2026-08-02T00:00:00.000Z"),
    };
    const updates: Array<Record<string, unknown>> = [];
    const select = vi.fn(() => {
      let table: unknown;
      const builder = {
        from(value: unknown) {
          table = value;
          return builder;
        },
        where() {
          return builder;
        },
        limit() {
          return Promise.resolve(table === activities ? [staleActivity] : []);
        },
        orderBy() {
          if (table !== activitySegments && table !== activityAnalysisRevisions) {
            throw new Error("Unexpected athlete-state evidence table");
          }
          return Promise.resolve([]);
        },
      };
      return builder;
    });
    const update = vi.fn(() => {
      let values: Record<string, unknown> = {};
      const builder = {
        set(input: Record<string, unknown>) {
          values = input;
          return builder;
        },
        where() {
          updates.push(values);
          return Promise.resolve([]);
        },
      };
      return builder;
    });
    const deleteTrainingEffects = vi.fn(() => {
      const builder = {
        where() {
          return builder;
        },
        returning() {
          return Promise.resolve([]);
        },
      };
      return builder;
    });
    const tx = { delete: deleteTrainingEffects, select, update } as never;

    await expect(
      materializeActivityAthleteStateEvidence(tx, {
        profileId,
        activityId,
        computedAt: new Date("2026-08-17T12:00:00.000Z"),
        contextDb: tx,
        deferAthleteStateRefresh: true,
        preparedSegmentSummaries: [],
      }),
    ).resolves.toEqual({
      commonLoad: null,
      confidence: null,
      effectiveAt: finishedAt,
      materialChanged: true,
    });

    expect(updates).toEqual([
      {
        athlete_state_common_load: null,
        athlete_state_activity_category: null,
        athlete_state_evidence_confidence: null,
        athlete_state_capability_distance_meters: null,
        athlete_state_capability_duration_minutes: null,
        athlete_state_input_version: null,
        athlete_state_computed_at: null,
      },
    ]);
    expect(deleteTrainingEffects).toHaveBeenCalledOnce();
  });
});
