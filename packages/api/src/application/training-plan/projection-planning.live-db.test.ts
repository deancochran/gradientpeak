import { randomUUID } from "node:crypto";

import { DRAFT_PLAN_PROJECTION_ALGORITHM_VERSION, trainingPlanSchema } from "@repo/core";
import { buildPerformanceTargetFactsFixture } from "@repo/core/testing/performance-model";
import { db, pool } from "@repo/db/client";
import {
  activityImportRuns,
  activityPlans,
  profileAthleteState,
  profilePerformanceEstimates,
  profiles,
  trainingPlans,
  users,
} from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { createActivityImportRepository } from "../../repositories/activity-import-repository";
import { activityPlanStructureHash } from "../activity-plans/structure-hash";
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
  const performanceTargets = buildPerformanceTargetFactsFixture({
    asOf: publishedAt.toISOString(),
    athleteId: profileId,
    bikeThresholdWatts: 285,
  });
  await db.insert(profilePerformanceEstimates).values({
    profile_id: profileId,
    capability_kind: "bike_ftp",
    activity_category: "bike",
    value: 285,
    unit: "watts",
    confidence: 0.9,
    effective_at: publishedAt,
    evidence_window_start_at: new Date("2026-07-01T00:00:00.000Z"),
    evidence_window_end_at: publishedAt,
    algorithm_version: "athlete-state-projection-v1",
    source_revision: 1,
    target_fact: performanceTargets.thresholds.bike,
    computed_at: publishedAt,
  });
  const activityStructure = {
    version: 3 as const,
    segments: [
      {
        id: randomUUID(),
        role: "activity" as const,
        activity_category: "bike" as const,
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
  };
  await db.insert(activityPlans).values({
    id: activityPlanId,
    profile_id: profileId,
    name: "Projected ride",
    content_visibility: "public",
    structure: activityStructure,
    structure_hash: activityPlanStructureHash(activityStructure),
  });
  const structure = {
    version: 1 as const,
    sessions: [{ activity_plan_id: activityPlanId, offset_days: 0 }],
    builder_planning_snapshot: {
      version: 1 as const,
      plan_preferences: {
        duration_weeks: 1,
        weekly_session_count: 1,
        target_weekly_hours: null,
        rest_days_per_week: 6,
      },
      scheduling: { preferred_weekdays: [1] },
      goal_context: { selected_goals: [] },
    },
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
    await db.delete(trainingPlans).where(eq(trainingPlans.profile_id, profileId));
    await db.delete(activityPlans).where(eq(activityPlans.profile_id, profileId));
    await db
      .delete(profilePerformanceEstimates)
      .where(eq(profilePerformanceEstimates.profile_id, profileId));
    await db.delete(profileAthleteState).where(eq(profileAthleteState.profile_id, profileId));
    await db.delete(profiles).where(eq(profiles.id, profileId));
    await db.delete(users).where(eq(users.id, profileId));
  }
});

afterAll(async () => pool.end());

describe("atomic training-plan preview and commit against PostgreSQL", () => {
  it("recalculates create, update, and duplicate commits and rejects a concurrent stale update", async () => {
    const fixture = await seedFixture();
    const createDraft = {
      name: "Atomic create",
      description: null,
      structure: fixture.structure,
      previewStartDate,
    };
    const createPreview = await previewTrainingPlan({
      db,
      profileId: fixture.profileId,
      values: { kind: "create", draft: createDraft },
    });
    expect(createPreview.status).toBe("available");
    if (createPreview.status !== "available") throw new Error("Expected create preview");
    const created = await commitTrainingPlan({
      db,
      profileId: fixture.profileId,
      values: {
        kind: "create",
        draft: createDraft,
        basePublishedRevision: createPreview.basePublishedRevision,
      },
    });
    expect(created).toMatchObject({ status: "saved", kind: "create", planRevision: 1 });
    if (created.status !== "saved") throw new Error("Expected create commit");
    expect(projectionSemantics(created.simulation)).toEqual(
      projectionSemantics(createPreview.simulation),
    );
    expect(created.planId).not.toBe(fixture.planId);

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
      values: { kind: "update", draft: updateDraft },
    });
    expect(updatePreview.status).toBe("available");
    if (updatePreview.status !== "available") throw new Error("Expected update preview");
    const values = {
      kind: "update" as const,
      draft: updateDraft,
      basePublishedRevision: updatePreview.basePublishedRevision,
    };
    const [first, second] = await Promise.all([
      commitTrainingPlan({ db, profileId: fixture.profileId, values }),
      commitTrainingPlan({ db, profileId: fixture.profileId, values }),
    ]);
    expect([first.status, second.status].sort()).toEqual(["saved", "stale"]);
    const saved = first.status === "saved" ? first : second.status === "saved" ? second : null;
    expect(projectionSemantics(saved?.simulation)).toEqual(
      projectionSemantics(updatePreview.simulation),
    );

    const duplicateDraft = {
      sourcePlanId: fixture.planId,
      name: "Projection plan copy",
      previewStartDate,
    };
    const duplicatePreview = await previewTrainingPlan({
      db,
      profileId: fixture.profileId,
      values: { kind: "duplicate", draft: duplicateDraft },
    });
    expect(duplicatePreview.status).toBe("available");
    if (duplicatePreview.status !== "available") throw new Error("Expected duplicate preview");
    const duplicated = await commitTrainingPlan({
      db,
      profileId: fixture.profileId,
      values: {
        kind: "duplicate",
        draft: duplicateDraft,
        basePublishedRevision: duplicatePreview.basePublishedRevision,
      },
    });
    expect(duplicated).toMatchObject({ status: "saved", kind: "duplicate", planRevision: 1 });
    if (duplicated.status !== "saved") throw new Error("Expected duplicate commit");
    expect(projectionSemantics(duplicated.simulation)).toEqual(
      projectionSemantics(duplicatePreview.simulation),
    );
    expect(duplicated.planId).not.toBe(fixture.planId);
  });

  it("blocks persistence when authority becomes stale or a linked plan becomes unavailable", async () => {
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

    const imports = createActivityImportRepository(db);
    await imports.create({ profileId: fixture.profileId, kind: "manual_sync" });
    await expect(
      commitTrainingPlan({
        db,
        profileId: fixture.profileId,
        values: {
          kind: "duplicate",
          draft: duplicateDraft,
          basePublishedRevision: preview.basePublishedRevision,
        },
      }),
    ).resolves.toMatchObject({ status: "stale", reason: "state_revision" });

    await db.delete(activityImportRuns).where(eq(activityImportRuns.profile_id, fixture.profileId));
    await db.delete(activityPlans).where(eq(activityPlans.id, fixture.activityPlanId));
    await expect(
      commitTrainingPlan({
        db,
        profileId: fixture.profileId,
        values: {
          kind: "duplicate",
          draft: duplicateDraft,
          basePublishedRevision: preview.basePublishedRevision,
        },
      }),
    ).resolves.toMatchObject({ status: "stale", reason: "linked_plan_unavailable" });

    const rows = await db
      .select({ algorithm: trainingPlans.projection_algorithm_version })
      .from(trainingPlans)
      .where(eq(trainingPlans.profile_id, fixture.profileId));
    expect(rows).toEqual([{ algorithm: null }]);
    expect(rows).not.toContainEqual({ algorithm: DRAFT_PLAN_PROJECTION_ALGORITHM_VERSION });
  });
});
