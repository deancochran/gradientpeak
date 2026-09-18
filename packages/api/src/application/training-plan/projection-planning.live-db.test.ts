import { randomUUID } from "node:crypto";

import {
  DRAFT_PLAN_PROJECTION_ALGORITHM_VERSION,
  prescriptionResolutionManifestSchema,
  trainingPlanSchema,
} from "@repo/core";
import { activityPlanSemanticHash, activityPlanStructureSchema } from "@repo/core/activity-plan";
import { db, pool } from "@repo/db/client";
import {
  activities,
  activityArtifactLinks,
  activityArtifacts,
  activityEfforts,
  activityImportRuns,
  activityPlans,
  activitySegments,
  plannedSessions,
  profileAthleteState,
  profiles,
  thresholdEvaluationEfforts,
  thresholdEvaluations,
  thresholds,
  trainingPlanApplicationCommandReceipts,
  trainingPlanApplications,
  trainingPlans,
  users,
} from "@repo/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { createActivityImportRepository } from "../../repositories/activity-import-repository";
import { activityPlanStructureHash } from "../activity-plans/structure-hash";
import {
  previewRemoveAppliedScheduleUseCase,
  removeAppliedScheduleUseCase,
} from "./appliedScheduleUseCases";
import {
  applyTrainingPlanApplication,
  previewTrainingPlanApplication,
} from "./applyTemplateUseCase";
import { commitTrainingPlan, previewTrainingPlan } from "./projection-planning";

const seededProfileIds: string[] = [];
const previewStartDate = "2026-08-03";

function projectionSemantics(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(projectionSemantics);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "asOf" && key !== "simulatedAt")
      .map(([key, nested]) => [key, projectionSemantics(nested)]),
  );
}

async function seedFixture() {
  const profileId = randomUUID();
  const activityPlanId = randomUUID();
  const planId = randomUUID();
  const sourceActivityId = randomUUID();
  const sourceArtifactId = randomUUID();
  const sourceSegmentId = randomUUID();
  const sourceEffortId = randomUUID();
  const thresholdEvaluationId = randomUUID();
  const sourceDigest = randomUUID().replaceAll("-", "").repeat(2);
  const now = new Date("2026-08-01T00:00:00.000Z");
  const publishedAt = new Date("2026-08-01T01:00:00.000Z");
  const email = `${profileId}@projection-planning.test`;
  await db.insert(users).values({
    id: profileId,
    name: "Projection planning test",
    email,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(profiles).values({
    id: profileId,
    email,
    planning_timezone: "UTC",
    created_at: now,
    updated_at: now,
  });
  seededProfileIds.push(profileId);
  await db.insert(profileAthleteState).values({
    profile_id: profileId,
    source_revision: 1,
    published_revision: 1,
    dirty_from_at: null,
    fitness: 42,
    fatigue: 36,
    evidence_confidence: 0.8,
    coverage_start_at: new Date("2026-07-01T00:00:00.000Z"),
    coverage_end_at: publishedAt,
    last_activity_at: publishedAt,
    algorithm_version: "athlete-state-projection-v1",
    computed_at: publishedAt,
    updated_at: publishedAt,
  });
  await db.transaction(async (tx) => {
    await tx.insert(activities).values({
      id: sourceActivityId,
      profile_id: profileId,
      name: "Canonical bike threshold source",
      started_at: new Date("2026-07-31T00:30:00.000Z"),
      finished_at: publishedAt,
      elapsed_ms: 1_800_000,
      active_ms: 1_800_000,
      moving_ms: 1_800_000,
      timing_coverage: "complete",
      segments_revision: 1,
      parser_version: "projection-planning-fixture-v1",
      decoded_contract_version: "projection-planning-fixture-v1",
      materializer_version: "projection-planning-fixture-v1",
      segments_generated_at: now,
      created_at: now,
      updated_at: now,
    });
    await tx.insert(activityArtifacts).values({
      id: sourceArtifactId,
      profile_id: profileId,
      digest_algorithm: "sha256",
      digest: sourceDigest,
      byte_size: 1_024,
      bucket: "activity-files",
      path: `artifacts/sha256/${profileId}/${sourceDigest}`,
      media_type: "application/vnd.ant.fit",
      format: "fit",
      availability: "accepted",
      first_accepted_at: now,
    });
    await tx.insert(activityArtifactLinks).values({
      id: randomUUID(),
      activity_id: sourceActivityId,
      artifact_id: sourceArtifactId,
      profile_id: profileId,
      role: "source",
      ordinal: 0,
      is_current: true,
      linked_at: now,
    });
    await tx.insert(activitySegments).values({
      id: sourceSegmentId,
      activity_id: sourceActivityId,
      profile_id: profileId,
      ordinal: 0,
      role: "activity",
      activity_category: "bike",
      start_offset_ms: 0,
      end_offset_ms: 1_800_000,
      source_artifact_id: sourceArtifactId,
      source_session_index: 0,
      summary: {
        version: 1,
        timing: { timingCoverage: "complete", activeMs: 1_800_000, movingMs: 1_800_000 },
      },
      summary_version: 1,
      timing_coverage: "complete",
      active_ms: 1_800_000,
      moving_ms: 1_800_000,
      segment_revision: 1,
      parser_version: "projection-planning-fixture-v1",
      materializer_version: "projection-planning-fixture-v1",
      created_at: now,
    });
    await tx.insert(activityEfforts).values({
      id: sourceEffortId,
      created_at: now,
      profile_id: profileId,
      activity_id: sourceActivityId,
      segment_id: sourceSegmentId,
      recorded_at: publishedAt,
      activity_category: "bike",
      effort_type: "power",
      source_series: "power",
      duration_seconds: 1_800,
      source_artifact_id: sourceArtifactId,
      source_revision: 1,
      start_offset_ms: 0,
      end_offset_ms: 1_800_000,
      window_coverage: 1,
      max_gap_seconds: 2,
      unit: "watts",
      value: 285,
      source: "imported",
      method: "activity_file_best_effort",
      calculation_version: "best-effort-extraction-v1",
      provenance: {
        observation_id: sourceEffortId,
        activity_id: sourceActivityId,
        segment_id: sourceSegmentId,
        derived_from: "activity_file_stream",
        source_series: "power",
        interval_convention: "current_sample_applies_to_preceding_interval",
        exact_window_start_timestamp_seconds:
          new Date("2026-07-31T00:30:00.000Z").getTime() / 1_000,
        exact_window_end_timestamp_seconds: publishedAt.getTime() / 1_000,
        exact_window_start_offset_seconds: 0,
        exact_window_end_offset_seconds: 1_800,
        duration_seconds: 1_800,
        contributing_duration_seconds: 1_800,
        window_coverage: 1,
        source_time_coverage: 1,
        extraction_status: "available",
        extraction_reason: null,
        persisted_start_offset_quantization: "nearest_millisecond_v1",
        calculation_version: "best-effort-extraction-v1",
      },
    });
  });
  await db.transaction(async (tx) => {
    await tx.insert(thresholdEvaluations).values({
      id: thresholdEvaluationId,
      profile_id: profileId,
      activity_category: "bike",
      metric: "power",
      method: "bike_power_30m",
      outcome: "qualified",
      value: 285,
      unit: "watts",
      confidence: 0.9,
      observed_at: publishedAt,
      rejection_reason: null,
      policy_version: "threshold-policy-v1",
      diagnostics: { fixture: "projection-planning" },
      source_activity_id: sourceActivityId,
      source_revision: 1,
      created_at: now,
    });
    await tx.insert(thresholdEvaluationEfforts).values({
      evaluation_id: thresholdEvaluationId,
      effort_id: sourceEffortId,
      profile_id: profileId,
      activity_category: "bike",
      activity_id: sourceActivityId,
      source_revision: 1,
      metric: "power",
      effort_type: "power",
      source_series: "power",
      role: "primary",
      ordinal: 0,
    });
  });
  await db.insert(thresholds).values({
    profile_id: profileId,
    activity_category: "bike",
    metric: "power",
    evaluation_id: thresholdEvaluationId,
    evaluation_outcome: "qualified",
    value: 285,
    unit: "watts",
    confidence: 0.9,
    method: "bike_power_30m",
    effective_at: publishedAt,
    policy_version: "threshold-policy-v1",
    created_at: now,
  });
  const activityStructure = activityPlanStructureSchema.parse({
    version: 3 as const,
    activity_category: "bike" as const,
    segments: [
      {
        id: randomUUID(),
        role: "activity" as const,
        name: "Projected ride",
        intervals: [
          {
            id: randomUUID(),
            name: "Main",
            repetitions: 1,
            steps: [
              {
                id: randomUUID(),
                name: "Steady ride",
                duration: { type: "time" as const, seconds: 3_600 },
                targets: [{ type: "%FTP" as const, intensity: 80 }],
              },
            ],
          },
        ],
      },
    ],
  });
  await db.insert(activityPlans).values({
    id: activityPlanId,
    profile_id: profileId,
    name: "Projected ride",
    content_visibility: "public",
    training_intent: "aerobic_base",
    structure: activityStructure,
    structure_hash: activityPlanStructureHash(activityStructure),
    semantic_hash: activityPlanSemanticHash({
      structure: activityStructure,
      adaptation: null,
      trainingIntent: "aerobic_base",
    }),
  });
  const structure = {
    version: 1 as const,
    plan_preferences: {
      weekly_session_count: 1,
      target_weekly_duration_minutes: 60,
      maximum_session_duration_minutes: 60,
      preferred_weekdays: [1],
      rest_days: [],
      progression_style: "balanced" as const,
      recovery_priority: "balanced" as const,
    },
    sessions: [
      {
        id: randomUUID(),
        activity_plan_id: activityPlanId,
        offset_days: 0,
        demand: {
          activity_category: "bike" as const,
          training_intent: "aerobic_base" as const,
          target_duration_minutes: 60,
          target_common_load: null,
          importance: "normal" as const,
        },
      },
    ],
  };
  const persistedStructure = trainingPlanSchema.parse({ ...structure, id: planId });
  const structureHash = activityPlanStructureHash(persistedStructure);
  await db.insert(trainingPlans).values({
    id: planId,
    profile_id: profileId,
    name: "Projection plan",
    structure: persistedStructure,
    structure_hash: structureHash,
  });
  return { activityPlanId, planId, profileId, structure, structureHash };
}

afterEach(async () => {
  while (seededProfileIds.length > 0) {
    const profileId = seededProfileIds.pop();
    if (!profileId) continue;
    await db.delete(activityImportRuns).where(eq(activityImportRuns.profile_id, profileId));
    await db
      .delete(trainingPlanApplicationCommandReceipts)
      .where(eq(trainingPlanApplicationCommandReceipts.profile_id, profileId));
    await db.delete(plannedSessions).where(eq(plannedSessions.profile_id, profileId));
    await db
      .delete(trainingPlanApplications)
      .where(eq(trainingPlanApplications.profile_id, profileId));
    await db.delete(trainingPlans).where(eq(trainingPlans.profile_id, profileId));
    await db.delete(activityPlans).where(eq(activityPlans.profile_id, profileId));
    await db.delete(profileAthleteState).where(eq(profileAthleteState.profile_id, profileId));
    await db.delete(activities).where(eq(activities.profile_id, profileId));
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('gradientpeak.artifact_lifecycle_authorized', 'on', true)`,
      );
      await tx
        .update(activityArtifacts)
        .set({ availability: "deletion_pending", deletion_requested_at: new Date() })
        .where(eq(activityArtifacts.profile_id, profileId));
      await tx
        .update(activityArtifacts)
        .set({ availability: "deleted", deleted_at: new Date() })
        .where(eq(activityArtifacts.profile_id, profileId));
      await tx.execute(
        sql`select set_config('gradientpeak.artifact_hard_delete_authorized', 'on', true)`,
      );
      await tx.delete(activityArtifacts).where(eq(activityArtifacts.profile_id, profileId));
    });
    await db.delete(profiles).where(eq(profiles.id, profileId));
    await db.delete(users).where(eq(users.id, profileId));
  }
});

afterAll(async () => pool.end());

describe("atomic training-plan preview and commit against PostgreSQL", () => {
  it("isolates repeated applications and replays one operation without touching today or completed work", async () => {
    const fixture = await seedFixture();
    const now = new Date("2026-08-01T12:00:00.000Z");
    const apply = async (startDate: string, operationId: string) => {
      const preview = await previewTrainingPlanApplication({
        db,
        profileId: fixture.profileId,
        values: { trainingPlanId: fixture.planId, startDate },
        now,
      });
      if (preview.status !== "available") throw new Error("Expected available application preview");
      return applyTrainingPlanApplication({
        db,
        profileId: fixture.profileId,
        now,
        values: {
          trainingPlanId: fixture.planId,
          startDate,
          operationId,
          expectedPlanRevision: preview.planRevision,
          expectedPlanHash: preview.planHash,
          basePublishedRevision: preview.basePublishedRevision,
          previewFingerprint: preview.previewFingerprint,
        },
      });
    };

    const first = await apply("2026-08-03", "application_isolation_operation_0001");
    const second = await apply("2026-08-10", "application_isolation_operation_0002");
    expect(first).toMatchObject({ status: "applied", created: 1 });
    expect(second).toMatchObject({ status: "applied", created: 1 });
    if (first.status !== "applied" || second.status !== "applied")
      throw new Error("Expected applications");
    expect(first.applicationId).not.toBe(second.applicationId);

    const retry = await apply("2026-08-03", "application_isolation_operation_0001");
    expect(retry).toEqual(first);
    await expect(apply("2026-08-17", "application_isolation_operation_0001")).resolves.toEqual({
      status: "operation_conflict",
    });

    await db
      .update(plannedSessions)
      .set({ planning_date: "2026-08-01" })
      .where(eq(plannedSessions.id, first.plannedSessionIds[0]!));
    const completedId = second.plannedSessionIds[0]!;
    await db
      .update(plannedSessions)
      .set({
        status: "completed",
        completion_state: null,
        completion_outcome: "skipped",
        skip_operation_id: randomUUID(),
        linked_at: now,
      })
      .where(eq(plannedSessions.id, completedId));

    const third = await apply("2026-08-24", "application_isolation_operation_0003");
    if (third.status !== "applied") throw new Error("Expected removable application");
    const removalPreview = await previewRemoveAppliedScheduleUseCase({
      db,
      profileId: fixture.profileId,
      applicationId: third.applicationId,
      now,
    });
    expect(removalPreview.affected).toEqual([
      { id: third.plannedSessionIds[0], sessionRevision: 1 },
    ]);
    await expect(
      removeAppliedScheduleUseCase({
        db,
        profileId: fixture.profileId,
        applicationId: third.applicationId,
        operationId: "application_remove_operation_0001",
        previewFingerprint: removalPreview.previewFingerprint,
        now,
      }),
    ).resolves.toMatchObject({
      application_id: third.applicationId,
      scheduled_sessions_removed: 1,
    });
    const protectedRows = await db
      .select({
        id: plannedSessions.id,
        status: plannedSessions.status,
        planningDate: plannedSessions.planning_date,
      })
      .from(plannedSessions)
      .where(eq(plannedSessions.profile_id, fixture.profileId));
    expect(protectedRows).toEqual(
      expect.arrayContaining([
        { id: first.plannedSessionIds[0], status: "scheduled", planningDate: "2026-08-01" },
        { id: completedId, status: "completed", planningDate: "2026-08-10" },
      ]),
    );
  });
  it("recomputes previewed manifests before applying a persisted revision", async () => {
    const fixture = await seedFixture();
    const now = new Date("2026-08-01T12:00:00.000Z");
    const options = {
      trainingPlanId: fixture.planId,
      applicationMode: "full" as const,
      startDate: previewStartDate,
    };
    const preview = await previewTrainingPlanApplication({
      db,
      profileId: fixture.profileId,
      values: options,
      now,
    });
    expect(preview).toMatchObject({ status: "available", applicable: true });
    if (preview.status !== "available") throw new Error("Expected application preview");
    const applied = await applyTrainingPlanApplication({
      db,
      profileId: fixture.profileId,
      now,
      values: {
        ...options,
        operationId: "apply_training_plan_revision_test_0001",
        expectedPlanRevision: preview.planRevision,
        expectedPlanHash: preview.planHash,
        basePublishedRevision: preview.basePublishedRevision,
        previewFingerprint: preview.previewFingerprint,
      },
    });
    expect(applied).toMatchObject({ status: "applied", created: preview.sessions.length });
    const rows = await db
      .select({
        planningDate: plannedSessions.planning_date,
        manifest: plannedSessions.resolution_manifest,
      })
      .from(plannedSessions)
      .where(eq(plannedSessions.profile_id, fixture.profileId));
    expect(rows).toHaveLength(preview.sessions.length);
    expect(rows.map((row) => row.planningDate)).toEqual(
      preview.sessions.map((session) => session.planningDate),
    );
    expect(
      rows.map((row) => prescriptionResolutionManifestSchema.parse(row.manifest).fingerprint),
    ).toEqual(
      preview.sessions.map(
        (session) => prescriptionResolutionManifestSchema.parse(session.manifest).fingerprint,
      ),
    );
    await expect(
      applyTrainingPlanApplication({
        db,
        profileId: fixture.profileId,
        now,
        values: {
          ...options,
          operationId: "apply_training_plan_revision_test_0002",
          expectedPlanRevision: preview.planRevision,
          expectedPlanHash: preview.planHash,
          basePublishedRevision: preview.basePublishedRevision,
          previewFingerprint: `v1:sha256:${"0".repeat(64)}`,
        },
      }),
    ).resolves.toMatchObject({ status: "stale", reason: "preview_drift" });
  });

  it("previews and commits the same resolved prescription without athlete context", async () => {
    const fixture = await seedFixture();
    await db
      .delete(profileAthleteState)
      .where(eq(profileAthleteState.profile_id, fixture.profileId));
    const projectionNow = new Date("2026-08-01T12:00:00.000Z");
    const draft = {
      name: "No-context plan",
      description: null,
      structure: {
        ...fixture.structure,
        plan_preferences: {
          weekly_session_count: null,
          target_weekly_duration_minutes: null,
          maximum_session_duration_minutes: null,
          preferred_weekdays: [],
          rest_days: [],
          progression_style: null,
          recovery_priority: null,
        },
      },
      previewStartDate,
    };

    const preview = await previewTrainingPlan({
      db,
      profileId: fixture.profileId,
      now: projectionNow,
      values: { kind: "create", draft },
    });

    expect(preview).toMatchObject({ status: "available", applicable: true });
    if (preview.status !== "available") throw new Error("Expected no-context preview");
    expect(preview.basePublishedRevision).toBeNull();
    expect(preview.sessionResults).toHaveLength(1);
    expect(preview.sessionResults[0]).toMatchObject({
      status: "resolved",
      manifest: {
        fallback_level: "system_default_no_context",
        athlete_context_revision: null,
        evidence_facts: [],
      },
    });

    const committed = await commitTrainingPlan({
      db,
      profileId: fixture.profileId,
      now: projectionNow,
      values: {
        kind: "create",
        operationId: "commit_plan_no_context_create_0001_xxxx",
        draft,
        basePublishedRevision: preview.basePublishedRevision,
        previewFingerprint: preview.previewFingerprint,
      },
    });

    expect(committed).toMatchObject({
      status: "saved",
      previewFingerprint: preview.previewFingerprint,
    });
    if (committed.status !== "saved") throw new Error("Expected no-context commit");
    expect(projectionSemantics(committed.simulation)).toEqual(
      projectionSemantics(preview.simulation),
    );
  });

  it("previews and commits supported default drafts while published state is stale", async () => {
    const fixture = await seedFixture();
    const projectionNow = new Date("2026-08-01T12:00:00.000Z");
    const draft = {
      name: "Manual no-context plan",
      description: null,
      structure: {
        ...fixture.structure,
        plan_preferences: {
          weekly_session_count: null,
          target_weekly_duration_minutes: null,
          maximum_session_duration_minutes: null,
          preferred_weekdays: [],
          rest_days: [],
          progression_style: null,
          recovery_priority: null,
        },
      },
      previewStartDate,
    };
    const imports = createActivityImportRepository(db);
    await imports.create({ profileId: fixture.profileId, kind: "manual_sync" });

    const preview = await previewTrainingPlan({
      db,
      profileId: fixture.profileId,
      now: projectionNow,
      values: { kind: "create", draft },
    });

    expect(preview).toMatchObject({ status: "available", applicable: true });
    if (preview.status !== "available") throw new Error("Expected stale no-context preview");
    expect(preview.sessionResults[0]).toMatchObject({
      status: "resolved",
      manifest: {
        fallback_level: "system_default_no_context",
        athlete_context_revision: null,
        evidence_facts: [],
      },
    });

    await expect(
      commitTrainingPlan({
        db,
        profileId: fixture.profileId,
        now: projectionNow,
        values: {
          kind: "create",
          operationId: "commit_plan_stale_context_create_0001_xxxx",
          draft,
          basePublishedRevision: preview.basePublishedRevision,
          previewFingerprint: preview.previewFingerprint,
        },
      }),
    ).resolves.toMatchObject({ status: "saved" });
  });

  it("recalculates create, update, and duplicate commits and rejects a concurrent stale update", async () => {
    const fixture = await seedFixture();
    const projectionNow = new Date("2026-08-01T12:00:00.000Z");
    const createDraft = {
      name: "Atomic create",
      description: null,
      structure: fixture.structure,
      previewStartDate,
    };
    const createPreview = await previewTrainingPlan({
      db,
      profileId: fixture.profileId,
      now: projectionNow,
      values: { kind: "create" as const, draft: createDraft },
    });
    expect(createPreview.status).toBe("available");
    if (createPreview.status !== "available") throw new Error("Expected create preview");
    const created = await commitTrainingPlan({
      db,
      profileId: fixture.profileId,
      now: projectionNow,
      values: {
        kind: "create" as const,
        operationId: "commit_plan_atomic_create_0001_xxxx",
        draft: createDraft,
        basePublishedRevision: createPreview.basePublishedRevision,
        previewFingerprint: createPreview.previewFingerprint,
      },
    });
    expect(created).toMatchObject({ status: "saved", kind: "create", planRevision: 1 });
    if (created.status !== "saved") throw new Error("Expected create commit");
    expect(projectionSemantics(created.simulation)).toEqual(
      projectionSemantics(createPreview.simulation),
    );
    expect(created.planId).not.toBe(fixture.planId);
    expect(created.previewFingerprint).toBe(createPreview.previewFingerprint);
    await expect(
      commitTrainingPlan({
        db,
        profileId: fixture.profileId,
        now: projectionNow,
        values: {
          kind: "create",
          operationId: "commit_plan_atomic_create_0001_xxxx",
          draft: createDraft,
          basePublishedRevision: createPreview.basePublishedRevision,
          previewFingerprint: createPreview.previewFingerprint,
        },
      }),
    ).resolves.toEqual(created);

    const updateDraft = {
      planId: fixture.planId,
      expectedRevision: 1,
      expectedStructureHash: fixture.structureHash,
      name: "Projection plan updated",
      description: null,
      structure: fixture.structure,
      previewStartDate,
    };
    const updatePreview = await previewTrainingPlan({
      db,
      profileId: fixture.profileId,
      now: projectionNow,
      values: { kind: "update" as const, draft: updateDraft },
    });
    expect(updatePreview.status).toBe("available");
    if (updatePreview.status !== "available") throw new Error("Expected update preview");
    const values = {
      kind: "update" as const,
      operationId: "commit_plan_atomic_update_0001_xxxx",
      draft: updateDraft,
      basePublishedRevision: updatePreview.basePublishedRevision,
      previewFingerprint: updatePreview.previewFingerprint,
    };
    const [first, second] = await Promise.all([
      commitTrainingPlan({ db, profileId: fixture.profileId, values, now: projectionNow }),
      commitTrainingPlan({ db, profileId: fixture.profileId, values, now: projectionNow }),
    ]);
    expect([first.status, second.status]).toEqual(["saved", "saved"]);
    const saved = first.status === "saved" ? first : null;
    expect(saved).toMatchObject({ status: "saved", kind: "update", planRevision: 2 });
    expect(projectionSemantics(saved?.simulation)).toEqual(
      projectionSemantics(updatePreview.simulation),
    );
    await expect(
      db
        .select({ name: trainingPlans.name, revision: trainingPlans.revision })
        .from(trainingPlans)
        .where(eq(trainingPlans.id, fixture.planId)),
    ).resolves.toEqual([{ name: "Projection plan updated", revision: 2 }]);

    const duplicateDraft = {
      sourcePlanId: fixture.planId,
      name: "Projection plan copy",
      previewStartDate,
    };
    const duplicatePreview = await previewTrainingPlan({
      db,
      profileId: fixture.profileId,
      now: projectionNow,
      values: { kind: "duplicate", draft: duplicateDraft },
    });
    expect(duplicatePreview.status).toBe("available");
    if (duplicatePreview.status !== "available") throw new Error("Expected duplicate preview");
    const duplicated = await commitTrainingPlan({
      db,
      profileId: fixture.profileId,
      now: projectionNow,
      values: {
        kind: "duplicate",
        operationId: "commit_plan_atomic_duplicate_0001_xxxx",
        draft: duplicateDraft,
        basePublishedRevision: duplicatePreview.basePublishedRevision,
        previewFingerprint: duplicatePreview.previewFingerprint,
      },
    });
    expect(duplicated).toMatchObject({ status: "saved", kind: "duplicate", planRevision: 1 });
    if (duplicated.status !== "saved") throw new Error("Expected duplicate commit");
    expect(projectionSemantics(duplicated.simulation)).toEqual(
      projectionSemantics(duplicatePreview.simulation),
    );
    expect(duplicated.planId).not.toBe(fixture.planId);
    expect(duplicated.previewFingerprint).toBe(duplicatePreview.previewFingerprint);
    await expect(
      commitTrainingPlan({
        db,
        profileId: fixture.profileId,
        now: projectionNow,
        values: {
          kind: "duplicate",
          operationId: "commit_plan_atomic_duplicate_0001_xxxx",
          draft: duplicateDraft,
          basePublishedRevision: duplicatePreview.basePublishedRevision,
          previewFingerprint: duplicatePreview.previewFingerprint,
        },
      }),
    ).resolves.toEqual(duplicated);
    await expect(
      commitTrainingPlan({
        db,
        profileId: fixture.profileId,
        now: projectionNow,
        values: {
          kind: "duplicate",
          operationId: "commit_plan_atomic_duplicate_0001_xxxx",
          draft: { ...duplicateDraft, name: "Different copy" },
          basePublishedRevision: duplicatePreview.basePublishedRevision,
          previewFingerprint: duplicatePreview.previewFingerprint,
        },
      }),
    ).resolves.toEqual({ status: "operation_conflict" });
  });

  it("rejects preview drift, published revision conflicts, and unavailable linked plans", async () => {
    const fixture = await seedFixture();
    const duplicateDraft = {
      sourcePlanId: fixture.planId,
      previewStartDate,
    };
    const preview = await previewTrainingPlan({
      db,
      profileId: fixture.profileId,
      values: { kind: "duplicate", draft: duplicateDraft },
    });
    if (preview.status !== "available") throw new Error("Expected duplicate preview");

    const changedActivityStructure = activityPlanStructureSchema.parse({
      version: 3,
      activity_category: "bike",
      segments: [
        {
          id: randomUUID(),
          role: "activity",
          name: "Changed projected ride",
          intervals: [
            {
              id: randomUUID(),
              name: "Main",
              repetitions: 1,
              steps: [
                {
                  id: randomUUID(),
                  name: "Changed steady ride",
                  duration: { type: "time", seconds: 3_600 },
                  targets: [{ type: "%FTP", intensity: 81 }],
                },
              ],
            },
          ],
        },
      ],
    });
    await db
      .update(activityPlans)
      .set({
        revision: 2,
        structure: changedActivityStructure,
        structure_hash: activityPlanStructureHash(changedActivityStructure),
        semantic_hash: activityPlanSemanticHash({
          structure: changedActivityStructure,
          adaptation: null,
          trainingIntent: "aerobic_base",
        }),
      })
      .where(eq(activityPlans.id, fixture.activityPlanId));
    const changedPreview = await previewTrainingPlan({
      db,
      profileId: fixture.profileId,
      values: { kind: "duplicate", draft: duplicateDraft },
    });
    expect(changedPreview).toMatchObject({ status: "available" });
    if (changedPreview.status !== "available")
      throw new Error("Expected changed duplicate preview");
    expect(changedPreview.previewFingerprint).not.toBe(preview.previewFingerprint);
    await expect(
      db
        .select({ publishedRevision: profileAthleteState.published_revision })
        .from(profileAthleteState)
        .where(eq(profileAthleteState.profile_id, fixture.profileId)),
    ).resolves.toEqual([{ publishedRevision: preview.basePublishedRevision }]);
    await expect(
      commitTrainingPlan({
        db,
        profileId: fixture.profileId,
        values: {
          kind: "duplicate",
          operationId: "commit_plan_activity_plan_drift_0001_xxxx",
          draft: duplicateDraft,
          basePublishedRevision: preview.basePublishedRevision,
          previewFingerprint: preview.previewFingerprint,
        },
      }),
    ).resolves.toMatchObject({ status: "stale", reason: "preview_drift" });

    const imports = createActivityImportRepository(db);
    await imports.create({ profileId: fixture.profileId, kind: "manual_sync" });
    await expect(
      commitTrainingPlan({
        db,
        profileId: fixture.profileId,
        values: {
          kind: "duplicate",
          operationId: "commit_plan_preview_drift_0001_xxxx",
          draft: duplicateDraft,
          basePublishedRevision: preview.basePublishedRevision,
          previewFingerprint: preview.previewFingerprint,
        },
      }),
    ).resolves.toMatchObject({
      status: "stale",
      // The import removes optional resolver context but does not publish a new revision.
      reason: "preview_drift",
      currentPublishedRevision: preview.basePublishedRevision,
    });

    await db.delete(activityImportRuns).where(eq(activityImportRuns.profile_id, fixture.profileId));
    await db.delete(activityPlans).where(eq(activityPlans.id, fixture.activityPlanId));
    await expect(
      commitTrainingPlan({
        db,
        profileId: fixture.profileId,
        values: {
          kind: "duplicate",
          operationId: "commit_plan_linked_unavailable_0001_xxxx",
          draft: duplicateDraft,
          basePublishedRevision: preview.basePublishedRevision,
          previewFingerprint: preview.previewFingerprint,
        },
      }),
    ).resolves.toMatchObject({ status: "stale", reason: "linked_plan_unavailable" });

    await db
      .update(profileAthleteState)
      .set({ source_revision: 2, published_revision: 2, dirty_from_at: null })
      .where(eq(profileAthleteState.profile_id, fixture.profileId));
    await expect(
      commitTrainingPlan({
        db,
        profileId: fixture.profileId,
        values: {
          kind: "duplicate",
          operationId: "commit_plan_state_revision_0001_xxxx",
          draft: duplicateDraft,
          basePublishedRevision: preview.basePublishedRevision,
          previewFingerprint: preview.previewFingerprint,
        },
      }),
    ).resolves.toMatchObject({ status: "stale", reason: "state_revision" });

    const rows = await db
      .select({ algorithm: trainingPlans.projection_algorithm_version })
      .from(trainingPlans)
      .where(eq(trainingPlans.profile_id, fixture.profileId));
    expect(rows).toEqual([{ algorithm: null }]);
    expect(rows).not.toContainEqual({ algorithm: DRAFT_PLAN_PROJECTION_ALGORITHM_VERSION });
  });
});
