import type {
  ActivityTrainingEffectRow,
  AthleteRecalculationQueueRow,
  DailyTrainingLoadRow,
  ThresholdEvidenceRow,
} from "@repo/db";
import { describe, expect, it } from "vitest";
import {
  mapActivityTrainingEffectRow,
  mapAthleteRecalculationRequestRow,
  mapDailyTrainingLoadRow,
  mapThresholdEvidenceRow,
} from "./drizzle-athlete-derived-state-repository";

const profileId = "11111111-1111-4111-8111-111111111111";
const activityId = "22222222-2222-4222-8222-222222222222";
const evidenceId = "33333333-3333-4333-8333-333333333333";
const at = new Date("2026-08-01T12:00:00.000Z");

const effectRow = {
  profile_id: profileId,
  activity_id: activityId,
  activity_analysis_revision: 2,
  contract_version: "athlete-derived-state-persistence-v1",
  effective_at: at,
  planning_date: "2026-08-01",
  source_revision: 7,
  calculation_version: "effect-v1",
  input_fingerprint: "a".repeat(64),
  activity_category: "bike",
  common_load: 42.5,
  evidence_confidence: 0.8,
  capability_observation: { distanceMeters: 40_000, durationMinutes: null },
  created_at: at,
} satisfies ActivityTrainingEffectRow;

const dailyRow = {
  profile_id: profileId,
  planning_date: "2026-08-01",
  contract_version: "athlete-derived-state-persistence-v1",
  common_load: 42.5,
  fitness: 30,
  fatigue: 20,
  form: 10,
  readiness: 82,
  coverage_status: "partial",
  contributing_activity_count: 1,
  omitted_activity_count: 2,
  source_revision: 7,
  calculation_version: "load-v1",
  published_at: at,
} satisfies DailyTrainingLoadRow;

const queueRow = {
  profile_id: profileId,
  contract_version: "athlete-derived-state-persistence-v1",
  idempotency_key: `athlete-recalculation:${profileId}`,
  earliest_affected_at: at,
  earliest_affected_planning_date: "2026-08-01",
  source_revision: 7,
  reasons: ["activity_changed", "threshold_changed"],
  requested_at: at,
  updated_at: at,
} satisfies AthleteRecalculationQueueRow;

const thresholdRow = {
  id: evidenceId,
  profile_id: profileId,
  activity_id: activityId,
  contract_version: "athlete-derived-state-persistence-v1",
  activity_category: "bike",
  metric: "power",
  unit: "watts",
  method: "bike_power_30m",
  value: 275,
  source_series_id: "power-primary",
  source_series_metric: "power",
  start_timestamp_seconds: 0,
  end_timestamp_seconds: 1800,
  exact_window_seconds: 1800,
  conversion_factor: 1,
  policy_version: "threshold-policy-v1",
  plausibility_version: "threshold-plausibility-v1",
  observed_at: at,
  calculation_version: "threshold-v1",
  confidence: 0.9,
  status: "active",
  invalidated_at: null,
  created_at: at,
} satisfies ThresholdEvidenceRow;

describe("athlete-derived Drizzle row mappers", () => {
  it("rebuilds Core effects with explicit stimulus provenance", () => {
    expect(mapActivityTrainingEffectRow(effectRow)).toMatchObject({
      profileId,
      activityId,
      activityAnalysisRevision: 2,
      effectiveAt: at.toISOString(),
      planningDate: "2026-08-01",
      sourceRevision: 7,
      stimulus: {
        kind: "observed",
        sourceId: activityId,
        occurredAt: at.toISOString(),
        commonLoad: 42.5,
        evidenceConfidence: 0.8,
      },
    });
  });

  it("rebuilds daily coverage, queue requests, and threshold evidence", () => {
    expect(mapDailyTrainingLoadRow(dailyRow)).toMatchObject({
      planningDate: "2026-08-01",
      coverage: { status: "partial", contributingActivityCount: 1, omittedActivityCount: 2 },
    });
    expect(mapAthleteRecalculationRequestRow(queueRow)).toMatchObject({
      profileId,
      reasons: ["activity_changed", "threshold_changed"],
      earliestAffectedAt: at.toISOString(),
    });
    expect(mapThresholdEvidenceRow(thresholdRow)).toMatchObject({
      profileId,
      confidence: 0.9,
      evidence: { evidenceId, activityId, value: 275, observedAt: at.toISOString() },
      lifecycle: { status: "active", invalidatedAt: null },
    });
  });

  it("fails closed for non-finite numerics and invalid database dates", () => {
    expect(() => mapActivityTrainingEffectRow({ ...effectRow, common_load: Number.NaN })).toThrow(
      "Invalid finite database number: common_load",
    );
    expect(() =>
      mapActivityTrainingEffectRow({ ...effectRow, effective_at: new Date("invalid") }),
    ).toThrow("Invalid database timestamp: effective_at");
  });
});
