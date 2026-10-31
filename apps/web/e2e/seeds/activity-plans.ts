import { createHash } from "node:crypto";
import {
  activityPlanAuthoringContentSchema,
  activityPlanSemanticHash,
  activityPlanStructureSchema,
  activityPlanTrainingIntentSchema,
  getCanonicalActivityPlanStructureHashInput,
} from "@repo/core/activity-plan";
import { completedSegmentSummarySchema } from "@repo/core/activity-segments";
import { calculateCyclingNormalizedPower } from "@repo/core/calculations";
import {
  thresholdCandidateSchema,
  thresholdEvaluationDiagnosticsSchema,
  thresholdEvaluationSchema,
  thresholdSelectionResultSchema,
} from "@repo/core/performance-calibration";
import {
  activities,
  activityArtifactLinks,
  activityArtifacts,
  activityEfforts,
  activityPlans,
  activityRoutes,
  activitySegments,
  thresholdEvaluationEfforts,
  thresholdEvaluations,
  thresholds,
} from "@repo/db/schema";
import { and, eq } from "drizzle-orm";
import type { LocalE2EDatabase } from "../support/database";

function activityPlanSeedStructureHash(structure: unknown) {
  return `v1:sha256:${createHash("sha256")
    .update(getCanonicalActivityPlanStructureHashInput(structure))
    .digest("hex")}`;
}
export async function seedOwnedActivityPlan(
  database: LocalE2EDatabase,
  profileId: string,
  isolatedNamespace: string,
  options: {
    primaryContentVisibility?: "private" | "followers" | "public";
  } = {},
) {
  const fixtureId = (label: string) => deterministicFixtureUuid(`${isolatedNamespace}|${label}`);
  const activityPlanId = fixtureId("primary");
  await upsertActivityPlan(database, {
    description: "A deterministic tempo activity plan for browser journeys.",
    id: activityPlanId,
    name: "Playwright Tempo Builder",
    notes: "Bring bottles",
    profileId,
    structure: {
      version: 5,
      activity_category: "bike",
      items: [
        {
          type: "step",
          id: "e3000000-0000-4000-8000-000000000001",
          name: "Warm-up",
          duration: { type: "time", seconds: 600 },
          targets: [{ type: "%FTP", intensity: 60 }],
        },
        {
          type: "step",
          id: "e3000000-0000-4000-8000-000000000002",
          name: "Tempo",
          duration: { type: "time", seconds: 1800 },
          targets: [{ type: "%FTP", intensity: 75 }],
        },
        {
          type: "step",
          id: "e3000000-0000-4000-8000-000000000003",
          name: "Cool-down",
          duration: { type: "time", seconds: 600 },
          targets: [{ type: "%FTP", intensity: 55 }],
        },
      ],
    },
    ...(options.primaryContentVisibility === undefined
      ? {}
      : { contentVisibility: options.primaryContentVisibility }),
  });
  await seedEstablishedBikePowerThreshold(database, profileId, fixtureId);
  for (let index = 1; index <= 21; index += 1) {
    const activityCategory = index % 2 === 0 ? "run" : "bike";
    await upsertActivityPlan(database, {
      description: `Deterministic ${activityCategory} library fixture ${index}.`,
      id: fixtureId(`library-${index}`),
      name: `Playwright Library ${String(index).padStart(2, "0")}`,
      notes: null,
      profileId,
      structure: {
        version: 5,
        activity_category: activityCategory,
        items: [
          {
            type: "step",
            id: `f3000000-0000-4000-8000-${String(index * 10).padStart(12, "0")}`,
            name: "Steady",
            duration: { type: "time", seconds: 600 },
            targets: [{ type: "RPE", intensity: 5 }],
          },
        ],
      },
    });
  }
  return { activityPlanId };
}
async function seedEstablishedBikePowerThreshold(
  database: LocalE2EDatabase,
  profileId: string,
  fixtureId: (label: string) => string,
) {
  const activityId = fixtureId("threshold-source-activity");
  const artifactId = fixtureId("threshold-source-artifact");
  const artifactLinkId = fixtureId("threshold-source-artifact-link");
  const segmentId = fixtureId("threshold-source-segment");
  const effortId = fixtureId("threshold-source-effort");
  const evaluationId = fixtureId("bike-power-threshold-evaluation");
  const observedAt = new Date("2026-08-01T12:00:00.000Z");
  const finishedAt = new Date("2026-08-01T12:30:00.000Z");
  const artifactDigest = createHash("sha256").update(activityId).digest("hex");
  const thresholdCandidate = thresholdCandidateSchema.parse({
    activityCategory: "bike",
    metric: "power",
    unit: "watts",
    method: "bike_power_30m",
    value: 285,
    sourceSeriesId: effortId,
    sourceSeriesMetric: "power",
    startTimestampSeconds: 0,
    endTimestampSeconds: 1800,
    exactWindowSeconds: 1800,
    conversionFactor: 0.95,
    policyVersion: "threshold-policy-v1",
    plausibilityVersion: "threshold-plausibility-v1",
  });
  const evaluationDiagnostics = thresholdEvaluationDiagnosticsSchema.parse({
    policyVersion: "threshold-policy-v1",
    plausibilityVersion: "threshold-plausibility-v1",
    selectedSeriesId: effortId,
    selectedSeriesRole: "preferred",
    selectedSeriesMetric: "power",
    exactWindowSeconds: 1800,
    conversionFactor: 0.95,
    requiredWindowCoverage: 0.95,
    maximumGapSeconds: 2,
    extractedValue: 300,
    thresholdValue: 285,
  });
  const evaluation = thresholdEvaluationSchema.parse({
    status: "qualified",
    candidate: thresholdCandidate,
    diagnostics: evaluationDiagnostics,
  });
  const selection = thresholdSelectionResultSchema.parse({
    status: "qualified",
    candidate: thresholdCandidate,
    selectedRole: "preferred",
    selectedEvidenceId: effortId,
    selectedActivityId: activityId,
    attempts: [
      {
        role: "preferred",
        metric: "power",
        evidenceIds: [effortId],
        evaluation,
      },
    ],
  });
  const segmentSummary = completedSegmentSummarySchema.parse({
    version: 1,
    timing: { timingCoverage: "complete", activeMs: 1800000, movingMs: 1800000 },
    averagePowerWatts: 285,
    normalizedPowerResult: calculateCyclingNormalizedPower({ samples: [] }),
  });
  await database.typedTransaction(async (transaction) => {
    const [existingThreshold] = await transaction
      .select({ id: thresholds.id })
      .from(thresholds)
      .where(
        and(
          eq(thresholds.profile_id, profileId),
          eq(thresholds.activity_category, "bike"),
          eq(thresholds.metric, "power"),
        ),
      )
      .limit(1);
    if (existingThreshold) return;
    await transaction
      .insert(activityArtifacts)
      .values({
        id: artifactId,
        profile_id: profileId,
        digest: artifactDigest,
        byte_size: 1,
        bucket: "activity-files",
        path: `artifacts/sha256/${profileId}/${artifactDigest}`,
        media_type: "application/fit",
        format: "fit",
        original_name: "threshold-source.fit",
      })
      .onConflictDoNothing();
    await transaction
      .insert(activities)
      .values({
        id: activityId,
        profile_id: profileId,
        name: "Playwright threshold source",
        started_at: observedAt,
        finished_at: finishedAt,
        elapsed_ms: 1800000,
        active_ms: 1800000,
        moving_ms: 1800000,
        timing_coverage: "complete",
        parser_version: "e2e-fixture",
        decoded_contract_version: "e2e-fixture-v1",
        materializer_version: "e2e-fixture",
        canonical_evidence_tier: "fit_artifact",
        segments_generated_at: finishedAt,
        distance_meters: 0,
      })
      .onConflictDoUpdate({
        target: activities.id,
        set: { profile_id: profileId, updated_at: new Date() },
      });
    await transaction
      .insert(activityArtifactLinks)
      .values({
        id: artifactLinkId,
        activity_id: activityId,
        artifact_id: artifactId,
        profile_id: profileId,
        role: "source",
        ordinal: 0,
        is_current: true,
      })
      .onConflictDoNothing();
    await transaction
      .insert(activitySegments)
      .values({
        id: segmentId,
        activity_id: activityId,
        profile_id: profileId,
        ordinal: 0,
        role: "activity",
        activity_category: "bike",
        start_offset_ms: 0,
        end_offset_ms: 1800000,
        source_artifact_id: artifactId,
        summary: segmentSummary,
        summary_version: 1,
        timing_coverage: "complete",
        active_ms: 1800000,
        moving_ms: 1800000,
        segment_revision: 1,
        parser_version: "e2e-fixture",
        materializer_version: "e2e-fixture",
      })
      .onConflictDoNothing();
    await transaction
      .insert(activityEfforts)
      .values({
        id: effortId,
        created_at: finishedAt,
        profile_id: profileId,
        activity_id: activityId,
        segment_id: segmentId,
        recorded_at: finishedAt,
        activity_category: "bike",
        effort_type: "power",
        source_series: "power",
        duration_seconds: 1800,
        source_artifact_id: artifactId,
        source_revision: 1,
        start_offset_ms: 0,
        end_offset_ms: 1800000,
        window_coverage: 1,
        max_gap_seconds: 1,
        unit: "watts",
        value: 285,
        source: "imported",
        method: "activity_file_best_effort",
        calculation_version: "e2e-fixture-v1",
        quality_score: 0.9,
        provenance: { fixture: "activity-plan-card" },
      })
      .onConflictDoNothing();
    await transaction
      .insert(thresholdEvaluations)
      .values({
        id: evaluationId,
        profile_id: profileId,
        activity_category: "bike",
        metric: "power",
        method: "bike_power_30m",
        outcome: "qualified",
        value: 285,
        unit: "watts",
        confidence: 1,
        observed_at: finishedAt,
        policy_version: "threshold-policy-v1",
        diagnostics: { selection, candidate: thresholdCandidate },
        source_activity_id: activityId,
        source_revision: 1,
      })
      .onConflictDoNothing();
    await transaction
      .insert(thresholdEvaluationEfforts)
      .values({
        evaluation_id: evaluationId,
        effort_id: effortId,
        profile_id: profileId,
        activity_category: "bike",
        activity_id: activityId,
        source_revision: 1,
        metric: "power",
        effort_type: "power",
        source_series: "power",
        role: "primary",
        ordinal: 0,
      })
      .onConflictDoNothing();
    await transaction
      .insert(thresholds)
      .values({
        profile_id: profileId,
        activity_category: "bike",
        metric: "power",
        evaluation_id: evaluationId,
        evaluation_outcome: "qualified",
        value: 285,
        unit: "watts",
        confidence: 1,
        method: "bike_power_30m",
        effective_at: finishedAt,
        policy_version: "threshold-policy-v1",
      })
      .onConflictDoNothing();
  });
}
export async function seedOwnedActivityRoute(
  database: LocalE2EDatabase,
  profileId: string,
  isolatedNamespace: string,
) {
  const routeId = deterministicFixtureUuid(`${isolatedNamespace}|primary-route`);
  await database.db
    .insert(activityRoutes)
    .values({
      id: routeId,
      profile_id: profileId,
      name: "Playwright Discovery Route",
      description: "Deterministic route for browser journeys.",
      file_path: `e2e/${profileId}/${routeId}.gpx`,
      storage_state: "ready",
      total_distance: 1000,
      total_ascent: 25,
      total_descent: 25,
      polyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@",
      is_public: true,
    })
    .onConflictDoUpdate({
      target: activityRoutes.id,
      set: {
        profile_id: profileId,
        name: "Playwright Discovery Route",
        description: "Deterministic route for browser journeys.",
        file_path: `e2e/${profileId}/${routeId}.gpx`,
        storage_state: "ready",
        total_distance: 1000,
        total_ascent: 25,
        total_descent: 25,
        polyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@",
        is_public: true,
        updated_at: new Date(),
      },
    });
  return { routeId };
}
function deterministicFixtureUuid(value: string) {
  const digest = createHash("sha256").update(value).digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}
async function upsertActivityPlan(
  database: LocalE2EDatabase,
  plan: {
    contentVisibility?: "private" | "followers" | "public";
    description: string;
    id: string;
    name: string;
    notes: string | null;
    profileId: string;
    structure: unknown;
    trainingIntent?: string;
  },
) {
  const structure = activityPlanStructureSchema.parse(plan.structure);
  const trainingIntent = activityPlanTrainingIntentSchema.parse(
    plan.trainingIntent ?? "general_maintenance",
  );
  // Seed writes must satisfy the authoring contract, not only the historical read shape.
  activityPlanAuthoringContentSchema.parse({
    structure,
    intent: { training_intent: trainingIntent },
  });
  const semanticHash = activityPlanSemanticHash({ structure, trainingIntent });
  await database.db
    .insert(activityPlans)
    .values({
      id: plan.id,
      profile_id: plan.profileId,
      name: plan.name,
      description: plan.description,
      notes: plan.notes,
      structure,
      structure_hash: activityPlanSeedStructureHash(structure),
      semantic_hash: semanticHash,
      training_intent: trainingIntent,
      gps_recording_enabled: true,
      content_visibility: plan.contentVisibility ?? "private",
      is_system_template: false,
    })
    .onConflictDoUpdate({
      target: activityPlans.id,
      set: {
        profile_id: plan.profileId,
        name: plan.name,
        description: plan.description,
        notes: plan.notes,
        structure,
        structure_hash: activityPlanSeedStructureHash(structure),
        semantic_hash: semanticHash,
        training_intent: trainingIntent,
        content_visibility: plan.contentVisibility ?? "private",
        updated_at: new Date(),
      },
    });
}
