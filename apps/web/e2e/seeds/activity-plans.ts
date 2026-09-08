import { createHash } from "node:crypto";
import { calculateCyclingNormalizedPower } from "@repo/core/calculations";
import type { E2EQuery, LocalE2EDatabase } from "../support/database";

function canonicalSeedJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Activity plan contains a non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalSeedJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalSeedJson(nested)}`)
      .join(",")}}`;
  }
  throw new Error(`Activity plan contains unsupported ${typeof value}`);
}

function activityPlanSeedStructureHash(structure: unknown) {
  return `v1:sha256:${createHash("sha256").update(canonicalSeedJson(structure)).digest("hex")}`;
}

export async function seedOwnedActivityPlan(
  pool: LocalE2EDatabase,
  profileId: string,
  isolatedNamespace: string,
  options: { primaryContentVisibility?: "private" | "followers" | "public" } = {},
) {
  const fixtureId = (label: string) => deterministicFixtureUuid(`${isolatedNamespace}|${label}`);
  const activityPlanId = fixtureId("primary");
  const structure = {
    version: 3,
    activity_category: "bike",
    segments: [
      {
        id: "e1000000-0000-4000-8000-000000000001",
        role: "activity",
        name: "Tempo ride",
        intervals: [
          {
            id: "e2000000-0000-4000-8000-000000000001",
            name: "Main set",
            repetitions: 1,
            steps: [
              {
                id: "e3000000-0000-4000-8000-000000000001",
                name: "Tempo",
                duration: { type: "time", seconds: 1_800 },
                targets: [{ type: "%FTP", intensity: 75 }],
              },
            ],
          },
        ],
      },
    ],
  };

  await upsertActivityPlan(pool, {
    description: "A deterministic tempo activity plan for browser journeys.",
    id: activityPlanId,
    name: "Playwright Tempo Builder",
    notes: "Bring bottles",
    profileId,
    structure,
    contentVisibility: options.primaryContentVisibility,
  });
  await seedEstablishedBikePowerThreshold(pool, profileId, fixtureId);

  for (let index = 1; index <= 21; index += 1) {
    const activity_category = index % 2 === 0 ? "run" : "bike";
    const libraryStructure = {
      version: 3,
      activity_category,
      segments: [
        {
          id: `f1000000-0000-4000-8000-${String(index * 10).padStart(12, "0")}`,
          role: "activity",
          name: `${activity_category} segment`,
          intervals: [
            {
              id: `f2000000-0000-4000-8000-${String(index * 10).padStart(12, "0")}`,
              name: "Steady work",
              repetitions: 1,
              steps: [
                {
                  id: `f3000000-0000-4000-8000-${String(index * 10).padStart(12, "0")}`,
                  name: "Steady",
                  duration: { type: "time", seconds: 600 },
                  targets: [{ type: "RPE", intensity: 5 }],
                },
              ],
            },
          ],
        },
      ],
    };

    await upsertActivityPlan(pool, {
      description: `Deterministic ${activity_category} library fixture ${index}.`,
      id: fixtureId(`library-${index}`),
      name: `Playwright Library ${String(index).padStart(2, "0")}`,
      notes: null,
      profileId,
      structure: libraryStructure,
    });
  }
  return { activityPlanId };
}

async function seedEstablishedBikePowerThreshold(
  database: LocalE2EDatabase,
  profileId: string,
  fixtureId: (label: string) => string,
) {
  const existingThreshold = await database.query(
    `select 1 from "thresholds"
     where "profile_id" = $1 and "activity_category" = 'bike' and "metric" = 'power'
     limit 1`,
    [profileId],
  );
  if (existingThreshold.rows.length > 0) return;

  const activityId = fixtureId("threshold-source-activity");
  const artifactId = fixtureId("threshold-source-artifact");
  const artifactLinkId = fixtureId("threshold-source-artifact-link");
  const segmentId = fixtureId("threshold-source-segment");
  const effortId = fixtureId("threshold-source-effort");
  const evaluationId = fixtureId("bike-power-threshold-evaluation");
  const observedAt = "2026-08-01T12:00:00.000Z";
  const finishedAt = "2026-08-01T12:30:00.000Z";
  const artifactDigest = createHash("sha256").update(activityId).digest("hex");
  const thresholdCandidate = {
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
  } as const;
  const evaluationDiagnostics = {
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
  } as const;
  const diagnostics = JSON.stringify({
    selection: {
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
          evaluation: {
            status: "qualified",
            candidate: thresholdCandidate,
            diagnostics: evaluationDiagnostics,
          },
        },
      ],
    },
    candidate: thresholdCandidate,
  });
  const segmentSummary = JSON.stringify({
    version: 1,
    timing: { timingCoverage: "complete", activeMs: 1_800_000, movingMs: 1_800_000 },
    averagePowerWatts: 285,
    normalizedPowerResult: calculateCyclingNormalizedPower({ samples: [] }),
  });

  await database.transaction(async (pool) => {
    await pool.query(
      `insert into "activity_artifacts" (
        "id", "profile_id", "digest", "byte_size", "bucket", "path", "media_type", "format", "original_name"
      ) values ($1, $2, $3, 1, 'activity-files', $4, 'application/fit', 'fit', 'threshold-source.fit')
      on conflict ("id") do nothing`,
      [artifactId, profileId, artifactDigest, `artifacts/sha256/${profileId}/${artifactDigest}`],
    );
    await pool.query(
      `insert into "activities" (
        "id", "profile_id", "name", "started_at", "finished_at", "elapsed_ms", "active_ms", "moving_ms",
        "timing_coverage", "parser_version", "decoded_contract_version", "materializer_version",
        "canonical_evidence_tier", "segments_generated_at"
      ) values ($1, $2, 'Playwright threshold source', $3, $4, 1800000, 1800000, 1800000,
        'complete', 'e2e-fixture', 'e2e-fixture-v1', 'e2e-fixture', 'fit_artifact', $4)
      on conflict ("id") do update set "profile_id" = excluded."profile_id", "updated_at" = now()`,
      [activityId, profileId, observedAt, finishedAt],
    );
    await pool.query(
      `insert into "activity_artifact_links" (
        "id", "activity_id", "artifact_id", "profile_id", "role", "ordinal", "is_current"
      ) values ($1, $2, $3, $4, 'source', 0, true)
      on conflict ("id") do nothing`,
      [artifactLinkId, activityId, artifactId, profileId],
    );
    await pool.query(
      `insert into "activity_segments" (
        "id", "activity_id", "profile_id", "ordinal", "role", "activity_category",
        "start_offset_ms", "end_offset_ms", "source_artifact_id", "summary", "summary_version",
        "timing_coverage", "active_ms", "moving_ms", "segment_revision", "parser_version", "materializer_version"
      ) values ($1, $2, $3, 0, 'activity', 'bike', 0, 1800000, $4,
        $5::jsonb,
        1, 'complete', 1800000, 1800000, 1, 'e2e-fixture', 'e2e-fixture')
      on conflict ("id") do nothing`,
      [segmentId, activityId, profileId, artifactId, segmentSummary],
    );
    await pool.query(
      `insert into "activity_efforts" (
        "id", "created_at", "profile_id", "activity_id", "segment_id", "recorded_at",
        "activity_category", "effort_type", "source_series", "duration_seconds", "source_artifact_id",
        "source_revision", "start_offset_ms", "end_offset_ms", "window_coverage", "max_gap_seconds",
        "unit", "value", "source", "method", "calculation_version", "quality_score", "provenance"
      ) values ($1, $2, $3, $4, $5, $2, 'bike', 'power', 'power', 1800, $6, 1, 0, 1800000,
        1, 1, 'watts', 285, 'imported', 'activity_file_best_effort', 'e2e-fixture-v1', 0.9,
        '{"fixture":"activity-plan-card"}'::jsonb)
      on conflict ("id") do nothing`,
      [effortId, finishedAt, profileId, activityId, segmentId, artifactId],
    );
    await pool.query(
      `insert into "threshold_evaluations" (
        "id", "profile_id", "activity_category", "metric", "method", "outcome", "value", "unit",
        "confidence", "observed_at", "rejection_reason", "policy_version", "diagnostics",
        "source_activity_id", "source_revision", "created_at"
      ) values ($1, $2, 'bike', 'power', 'bike_power_30m', 'qualified', 285, 'watts',
        1, $3, null, 'threshold-policy-v1', $5::jsonb, $4, 1, now())
      on conflict ("id") do nothing`,
      [evaluationId, profileId, finishedAt, activityId, diagnostics],
    );
    await pool.query(
      `insert into "threshold_evaluation_efforts" (
        "evaluation_id", "effort_id", "profile_id", "activity_category", "activity_id",
        "source_revision", "metric", "effort_type", "source_series", "role", "ordinal"
      ) values ($1, $2, $3, 'bike', $4, 1, 'power', 'power', 'power', 'primary', 0)
      on conflict ("evaluation_id", "effort_id") do nothing`,
      [evaluationId, effortId, profileId, activityId],
    );
    await pool.query(
      `insert into "thresholds" (
        "profile_id", "activity_category", "metric", "evaluation_id", "evaluation_outcome", "value", "unit",
        "confidence", "method", "effective_at", "policy_version", "created_at"
      ) values ($1, 'bike', 'power', $2, 'qualified', 285, 'watts',
        1, 'bike_power_30m', $3, 'threshold-policy-v1', now())
      on conflict ("evaluation_id") do nothing`,
      [profileId, evaluationId, finishedAt],
    );
  });
}

export async function seedOwnedActivityRoute(
  pool: E2EQuery,
  profileId: string,
  isolatedNamespace: string,
) {
  const routeId = deterministicFixtureUuid(`${isolatedNamespace}|primary-route`);
  await pool.query(
    `insert into "activity_routes" (
      "id", "profile_id", "name", "description", "file_path", "storage_state",
      "total_distance", "total_ascent", "total_descent", "polyline", "is_public"
    ) values ($1, $2, 'Playwright Discovery Route', 'Deterministic route for browser journeys.',
      $3, 'ready', 1000, 25, 25, '_p~iF~ps|U_ulLnnqC_mqNvxq\`@', true)
    on conflict ("id") do update set
      "profile_id" = excluded."profile_id",
      "name" = excluded."name",
      "description" = excluded."description",
      "file_path" = excluded."file_path",
      "storage_state" = excluded."storage_state",
      "total_distance" = excluded."total_distance",
      "total_ascent" = excluded."total_ascent",
      "total_descent" = excluded."total_descent",
      "polyline" = excluded."polyline",
      "is_public" = excluded."is_public",
      "updated_at" = now()`,
    [routeId, profileId, `e2e/${profileId}/${routeId}.gpx`],
  );
  return { routeId };
}

function deterministicFixtureUuid(value: string) {
  const digest = createHash("sha256").update(value).digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

async function upsertActivityPlan(
  pool: E2EQuery,
  plan: {
    contentVisibility?: "private" | "followers" | "public";
    description: string;
    id: string;
    name: string;
    notes: string | null;
    profileId: string;
    structure: unknown;
  },
) {
  await pool.query(
    `insert into "activity_plans" (
      "id", "profile_id", "name", "description", "notes", "structure", "structure_hash",
      "gps_recording_enabled", "content_visibility", "is_system_template"
    ) values ($1, $2, $3, $4, $5, $6::jsonb, $7, true, $8, false)
    on conflict ("id") do update set
      "profile_id" = excluded."profile_id",
      "name" = excluded."name",
      "description" = excluded."description",
      "notes" = excluded."notes",
      "structure" = excluded."structure",
      "structure_hash" = excluded."structure_hash",
      "content_visibility" = excluded."content_visibility",
      "updated_at" = now()`,
    [
      plan.id,
      plan.profileId,
      plan.name,
      plan.description,
      plan.notes,
      JSON.stringify(plan.structure),
      activityPlanSeedStructureHash(plan.structure),
      plan.contentVisibility ?? "private",
    ],
  );
}
