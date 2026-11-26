import { randomUUID } from "node:crypto";
import { calculateCyclingNormalizedPower } from "@repo/core/calculations";
import { db, pool } from "@repo/db/client";
import {
  activities,
  activityArtifacts,
  activityEfforts,
  profileMetrics,
  profiles,
  users,
} from "@repo/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { activityArtifactId, submitActivity } from "../../application/activities/submit-activity";
import { getSerializedProfile } from "../../application/profiles/readProfiles";
import {
  ProfileUpdateNotFoundError,
  ProfileUsernameConflictError,
  updateProfile,
} from "../../application/profiles/updateProfile";
import { createApiContext } from "../../context";
import { createActivityAnalysisStore } from "../../infrastructure/repositories";
import { resolveActivityContextFromEvidence } from "../../lib/activity-analysis";
import { readyActivityIngestion } from "../../test-support/ready-activity-ingestion";
import { profilesRouter } from "../profiles";

const seededUserIds: string[] = [];
const unavailableNormalizedPowerResult = calculateCyclingNormalizedPower({ samples: [] });

async function seedProfile(username: string) {
  const id = randomUUID();
  const email = `${id}@profile-update.test`;
  const now = new Date();
  await db.insert(users).values({
    id,
    name: "Profile Update Test",
    email,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(profiles).values({
    id,
    email,
    full_name: "Profile Update Test",
    username,
    bio: "before",
    language: "en",
    preferred_units: "metric",
    onboarding_status: "completed",
    is_public: true,
    created_at: now,
    updated_at: now,
  });
  seededUserIds.push(id);
  return id;
}

async function manualMetrics(profileId: string, metricType: "weight_kg") {
  return db
    .select()
    .from(profileMetrics)
    .where(
      and(
        eq(profileMetrics.profile_id, profileId),
        eq(profileMetrics.metric_type, metricType),
        isNull(profileMetrics.reference_activity_id),
      ),
    );
}

afterEach(async () => {
  while (seededUserIds.length) {
    const id = seededUserIds.pop();
    if (id) {
      await db.transaction(async (tx) => {
        await tx.delete(activityEfforts).where(eq(activityEfforts.profile_id, id));
        await tx.delete(activities).where(eq(activities.profile_id, id));
        await tx.delete(profileMetrics).where(eq(profileMetrics.profile_id, id));
        await tx.execute(
          sql`select set_config('gradientpeak.artifact_lifecycle_authorized', 'on', true)`,
        );
        await tx
          .update(activityArtifacts)
          .set({ availability: "deletion_pending", deletion_requested_at: new Date() })
          .where(eq(activityArtifacts.profile_id, id));
        await tx
          .update(activityArtifacts)
          .set({ availability: "deleted", deleted_at: new Date() })
          .where(eq(activityArtifacts.profile_id, id));
        await tx.execute(
          sql`select set_config('gradientpeak.artifact_hard_delete_authorized', 'on', true)`,
        );
        await tx.delete(activityArtifacts).where(eq(activityArtifacts.profile_id, id));
      });
      await db.delete(profiles).where(eq(profiles.id, id));
      await db.delete(users).where(eq(users.id, id));
    }
  }
});

afterAll(async () => pool.end());

describe("atomic profile update against PostgreSQL", () => {
  it("ownership-scopes the API update to the authenticated user across two real profiles", async () => {
    const actorId = await seedProfile(`actor-${randomUUID().slice(0, 8)}`);
    const victimId = await seedProfile(`victim-${randomUUID().slice(0, 8)}`);
    const context = await createApiContext({
      db,
      headers: new Headers({ "x-client-type": "server" }),
      auth: {
        session: {
          sessionId: randomUUID(),
          transport: "cookie",
          user: { id: actorId, email: `${actorId}@profile-update.test`, emailVerified: true },
        },
      },
    });
    const caller = profilesRouter.createCaller(context);

    await caller.update({ bio: "actor only" });
    await expect(
      caller.update({ bio: "victim write", profileId: victimId } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const [actor] = await db.select().from(profiles).where(eq(profiles.id, actorId));
    const [victim] = await db.select().from(profiles).where(eq(profiles.id, victimId));
    expect(actor?.bio).toBe("actor only");
    expect(victim?.bio).toBe("before");

    await expect(updateProfile(db, { profileId: randomUUID(), bio: "missing" })).rejects.toEqual(
      new ProfileUpdateNotFoundError(),
    );
  });

  it("persists weight transport values but rejects all manual threshold transport values", async () => {
    const profileId = await seedProfile(`transport-${randomUUID().slice(0, 8)}`);
    const caller = profilesRouter.createCaller(
      await createApiContext({
        db,
        headers: new Headers({ "x-client-type": "server" }),
        auth: {
          session: {
            sessionId: randomUUID(),
            transport: "cookie",
            user: { id: profileId, email: `${profileId}@profile-update.test`, emailVerified: true },
          },
        },
      }),
    );

    await caller.update({ weight_kg: "70.5" });
    expect(await getSerializedProfile(db, profileId)).toMatchObject({
      weight_kg: 70.5,
    });
    expect(await manualMetrics(profileId, "weight_kg")).toEqual([
      expect.objectContaining({
        value: 70.5,
        method: "profile_weight_setting",
        provenance: {
          input: "profile_update",
          observation_type: "observed",
          trusted: true,
          entered_by: "athlete",
        },
      }),
    ]);

    await caller.update({ weight_kg: "" });
    expect(await getSerializedProfile(db, profileId)).toMatchObject({
      weight_kg: null,
    });
    expect(await manualMetrics(profileId, "weight_kg")).toEqual([]);

    for (const input of [
      { threshold_hr: "180" },
      { threshold_hr: " " },
      { threshold_hr: null },
      { ftp: "300" },
      { ftp: "" },
      { ftp: null },
    ]) {
      await expect(caller.update(input as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    expect(
      await db
        .select()
        .from(activityEfforts)
        .where(and(eq(activityEfforts.profile_id, profileId), isNull(activityEfforts.activity_id))),
    ).toEqual([]);
  });

  it("rejects zero and non-finite activity effort values", async () => {
    const profileId = await seedProfile(`effort-check-${randomUUID().slice(0, 8)}`);
    const segmentId = randomUUID();
    const digest = randomUUID().replaceAll("-", "").repeat(2);
    const artifact = {
      sha256: digest,
      byteSize: 1_024,
      bucket: "activity-files",
      path: `artifacts/sha256/${profileId}/${digest}`,
      mediaType: "application/vnd.ant.fit",
      format: "fit" as const,
    };
    const ingestion = await readyActivityIngestion(db, {
      profileId,
      operationId: `profile-effort:${randomUUID()}`,
      source: "manual_import",
      artifact,
    });
    const created = await submitActivity(db, {
      profileId,
      name: "Effort constraint fixture",
      notes: null,
      contentVisibility: "private",
      startedAt: new Date("2026-01-01T10:00:00.000Z"),
      finishedAt: new Date("2026-01-01T10:20:00.000Z"),
      elapsedMs: 1_200_000,
      activeMs: 1_200_000,
      movingMs: 1_200_000,
      timingCoverage: "complete",
      segmentSet: {
        version: 1,
        elapsedMs: 1_200_000,
        segments: [
          {
            id: segmentId,
            ordinal: 0,
            role: "activity",
            activity_category: "bike",
            startOffsetMs: 0,
            endOffsetMs: 1_200_000,
            source: {
              kind: "artifact",
              artifactId: activityArtifactId(profileId, artifact.sha256, artifact.byteSize),
              source: { standard: "fit", format: "fit" },
            },
            summary: {
              version: 1,
              timing: { timingCoverage: "complete", activeMs: 1_200_000, movingMs: 1_200_000 },
              normalizedPowerResult: unavailableNormalizedPowerResult,
            },
          },
        ],
      },
      distanceMeters: 1_000,
      calories: null,
      elevationGainMeters: null,
      avgHeartRate: null,
      maxHeartRate: null,
      avgPower: null,
      maxPower: null,
      avgCadence: null,
      maxCadence: null,
      avgSpeedMps: null,
      maxSpeedMps: null,
      normalizedSpeedMps: null,
      avgTemperature: null,
      deviceManufacturer: null,
      deviceProduct: null,
      laps: null,
      mapBounds: null,
      polyline: null,
      analysis: {
        efforts: [],
        detectedLTHR: null,
        ingestion: { source: "manual_import", ...ingestion, artifact },
      },
    });
    const artifactId = activityArtifactId(profileId, artifact.sha256, artifact.byteSize);
    const insertEffort = (value: number | string) =>
      pool.query(
        `insert into public.activity_efforts (
          id, created_at, profile_id, activity_id, segment_id, recorded_at, activity_category,
          effort_type, source_series, duration_seconds, source_artifact_id, source_revision,
          start_offset_ms, end_offset_ms, window_coverage, max_gap_seconds, unit, value,
          source, method, calculation_version, provenance
        ) values ($1, now(), $2, $3, $4, now(), 'bike', 'power', 'power', 1200, $5, 1,
          0, 1200000, 1, 2, 'watts', $6::real, 'imported', 'activity_file_best_effort',
          'best-effort-extraction-v1', $7::jsonb)`,
        [
          randomUUID(),
          profileId,
          created.id,
          segmentId,
          artifactId,
          value,
          JSON.stringify({ fixture: "profile-update-effort-constraint" }),
        ],
      );

    await expect(insertEffort(250)).resolves.toBeDefined();

    await expect(insertEffort(0)).rejects.toMatchObject({
      code: "23514",
      constraint: "activity_efforts_value_finite_positive_check",
    });
    for (const value of ["NaN", "Infinity", "-Infinity"] as const) {
      await expect(insertEffort(value)).rejects.toMatchObject({ code: "23514" });
    }
  });

  it("synchronizes profile weight settings without sentinel history", async () => {
    const profileId = await seedProfile(`profile-${randomUUID().slice(0, 8)}`);
    const request = {
      profileId,
      username: `updated-${randomUUID().slice(0, 8)}`,
      language: "fr",
      preferred_units: "imperial" as const,
      weight_kg: 68.2,
    };

    await updateProfile(db, request);
    await updateProfile(db, request);
    await updateProfile(db, { profileId, bio: "partial" });

    const [profile] = await db.select().from(profiles).where(eq(profiles.id, profileId));
    expect(profile).toMatchObject({
      username: request.username,
      language: "fr",
      preferred_units: "imperial",
      bio: "partial",
    });
    expect(await manualMetrics(profileId, "weight_kg")).toHaveLength(1);

    await updateProfile(db, { profileId, weight_kg: 69 });
    expect((await manualMetrics(profileId, "weight_kg")).map((row) => row.value).sort()).toEqual([
      68.2, 69,
    ]);
    const analysisStore = createActivityAnalysisStore(db);
    const beforeClear = new Date(Date.now() + 1_000);
    const resolveStoredContext = async (activityTimestamp: Date) =>
      resolveActivityContextFromEvidence({
        activityTimestamp,
        evidence: await analysisStore.getContextSnapshot({
          asOf: activityTimestamp,
          effortLookbackAsOf: activityTimestamp,
          profileId,
        }),
      });
    await expect(resolveStoredContext(beforeClear)).resolves.toMatchObject({
      profileMetrics: { weight_kg: 69 },
    });

    await updateProfile(db, { profileId, weight_kg: null });
    expect(await manualMetrics(profileId, "weight_kg")).toEqual([]);
    expect(await getSerializedProfile(db, profileId)).toMatchObject({ weight_kg: null });
    const afterClear = new Date(Date.now() + 1_000);
    const afterClearContext = await resolveStoredContext(afterClear);
    expect(afterClearContext.profileMetrics).not.toHaveProperty("weight_kg");

    await updateProfile(db, { profileId, weight_kg: null });
    expect(await manualMetrics(profileId, "weight_kg")).toEqual([]);

    await updateProfile(db, { profileId, weight_kg: 71 });
    const reactivatedHistory = await manualMetrics(profileId, "weight_kg");
    expect(reactivatedHistory).toHaveLength(1);
    const reactivation = reactivatedHistory.find((row) => row.value === 71);
    expect(reactivation).toBeDefined();
    if (!reactivation) throw new Error("Expected reactivated weight observation");
    const afterReactivation = new Date(reactivation.recorded_at.getTime() + 1);
    const serializedProfile = await getSerializedProfile(db, profileId);
    expect(serializedProfile).toMatchObject({ weight_kg: 71 });
    expect(serializedProfile).not.toHaveProperty("threshold_hr");
    expect(serializedProfile).not.toHaveProperty("ftp");

    await expect(resolveStoredContext(afterReactivation)).resolves.toMatchObject({
      profileMetrics: { weight_kg: 71 },
    });

    expect(await manualMetrics(profileId, "weight_kg")).toEqual(reactivatedHistory);
    expect(
      await db.select().from(activityEfforts).where(eq(activityEfforts.profile_id, profileId)),
    ).toEqual([]);
  });

  it("rolls profile fields back when metric synchronization fails", async () => {
    const profileId = await seedProfile(`rollback-${randomUUID().slice(0, 8)}`);

    await expect(
      updateProfile(db, { profileId, bio: "must rollback", weight_kg: -1 }),
    ).rejects.toBeTruthy();

    const [profile] = await db.select().from(profiles).where(eq(profiles.id, profileId));
    expect(profile?.bio).toBe("before");
    expect(await manualMetrics(profileId, "weight_kg")).toEqual([]);
  });

  it("returns the stable username conflict and rolls back accompanying metrics", async () => {
    const existingUsername = `conflict-${randomUUID().slice(0, 8)}`;
    await seedProfile(existingUsername);
    const profileId = await seedProfile(`other-${randomUUID().slice(0, 8)}`);

    await expect(
      updateProfile(db, { profileId, username: existingUsername, weight_kg: 70 }),
    ).rejects.toEqual(new ProfileUsernameConflictError());

    expect(await manualMetrics(profileId, "weight_kg")).toEqual([]);
  });
});
