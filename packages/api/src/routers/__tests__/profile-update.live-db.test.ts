import { randomUUID } from "node:crypto";
import { db, pool } from "@repo/db/client";
import { activityEfforts, profileMetrics, profiles, users } from "@repo/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { getSerializedProfile } from "../../application/profiles/readProfiles";
import {
  ProfileUpdateNotFoundError,
  ProfileUsernameConflictError,
  updateProfile,
} from "../../application/profiles/updateProfile";
import { createApiContext } from "../../context";
import { createActivityAnalysisStore } from "../../infrastructure/repositories";
import {
  resolveActivityContextAsOf,
  resolveActivityContextFromEvidence,
} from "../../lib/activity-analysis";
import { isClearedProfileOverride } from "../../utils/profile-override-observations";
import { deriveProfileAwareCreationContext } from "../planning/training-plans";
import { profilesRouter } from "../profiles";

const seededUserIds: string[] = [];

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
    onboarded: true,
    is_public: true,
    created_at: now,
    updated_at: now,
  });
  seededUserIds.push(id);
  return id;
}

async function manualMetrics(profileId: string, metricType: "lthr" | "weight_kg") {
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

async function manualFtp(profileId: string) {
  return db
    .select()
    .from(activityEfforts)
    .where(
      and(
        eq(activityEfforts.profile_id, profileId),
        eq(activityEfforts.activity_category, "bike"),
        eq(activityEfforts.effort_type, "power"),
        eq(activityEfforts.duration_seconds, 1200),
        eq(activityEfforts.unit, "watts"),
        isNull(activityEfforts.activity_id),
      ),
    );
}

afterEach(async () => {
  while (seededUserIds.length) {
    const id = seededUserIds.pop();
    if (id) {
      await db.delete(activityEfforts).where(eq(activityEfforts.profile_id, id));
      await db.delete(profileMetrics).where(eq(profileMetrics.profile_id, id));
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

  it("accepts the canonical patch's numeric string and blank metric transport values", async () => {
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

    await caller.update({ weight_kg: "70.5", threshold_hr: "180", ftp: "300" });
    expect(await getSerializedProfile(db, profileId)).toMatchObject({
      weight_kg: 70.5,
      threshold_hr: 180,
      ftp: 300,
    });

    await caller.update({ weight_kg: "", threshold_hr: " ", ftp: "" });
    expect(await getSerializedProfile(db, profileId)).toMatchObject({
      weight_kg: null,
      threshold_hr: null,
      ftp: null,
    });
    expect((await manualMetrics(profileId, "weight_kg")).some(isClearedProfileOverride)).toBe(true);
    expect((await manualMetrics(profileId, "lthr")).some(isClearedProfileOverride)).toBe(true);
    expect((await manualFtp(profileId)).some(isClearedProfileOverride)).toBe(true);
  });

  it("keeps append-only override history and agrees across profile and as-of activity analysis", async () => {
    const profileId = await seedProfile(`profile-${randomUUID().slice(0, 8)}`);
    const request = {
      profileId,
      username: `updated-${randomUUID().slice(0, 8)}`,
      language: "fr",
      preferred_units: "imperial" as const,
      weight_kg: 68.2,
      threshold_hr: 182,
      ftp: 304,
    };

    await updateProfile(db, request);
    const [initialFtp] = await manualFtp(profileId);
    expect(initialFtp).toBeDefined();
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
    expect(await manualMetrics(profileId, "lthr")).toHaveLength(1);
    const ftpAfterRetry = await manualFtp(profileId);
    expect(ftpAfterRetry).toHaveLength(1);
    expect(ftpAfterRetry[0]).toMatchObject({
      id: initialFtp?.id,
      recorded_at: initialFtp?.recorded_at,
    });

    await updateProfile(db, { profileId, weight_kg: 69, ftp: 310 });
    expect((await manualMetrics(profileId, "weight_kg")).map((row) => row.value).sort()).toEqual([
      68.2, 69,
    ]);
    const ftpRows = await manualFtp(profileId);
    expect(ftpRows).toHaveLength(2);
    expect(ftpRows.some((row) => row.id === initialFtp?.id)).toBe(true);
    expect(Math.max(...ftpRows.map((row) => Number(row.value))) * 0.95).toBeCloseTo(310, 1);
    const analysisStore = createActivityAnalysisStore(db);
    const activePlanningContext = await deriveProfileAwareCreationContext({
      db,
      store: analysisStore,
      profileId,
      asOfIso: new Date(
        Math.max(...ftpRows.map((row) => row.recorded_at.getTime())) + 1,
      ).toISOString(),
    });
    expect(activePlanningContext.contextSummary.missing_optional_calibration_fields).not.toContain(
      "ftp",
    );

    await updateProfile(db, { profileId, weight_kg: null, threshold_hr: null, ftp: null });
    const weightHistory = await manualMetrics(profileId, "weight_kg");
    const lthrHistory = await manualMetrics(profileId, "lthr");
    const ftpHistory = await manualFtp(profileId);
    expect(weightHistory).toHaveLength(3);
    expect(lthrHistory).toHaveLength(2);
    expect(ftpHistory).toHaveLength(3);
    expect(weightHistory.some((row) => row.value === 68.2)).toBe(true);
    expect(lthrHistory.some((row) => row.value === 182)).toBe(true);
    expect(ftpHistory.some((row) => row.id === initialFtp?.id)).toBe(true);
    const tombstones = [
      weightHistory.find(isClearedProfileOverride),
      lthrHistory.find(isClearedProfileOverride),
      ftpHistory.find(isClearedProfileOverride),
    ];
    expect(tombstones.every(Boolean)).toBe(true);
    expect(ftpHistory.find(isClearedProfileOverride)?.value).toBe(0);
    await expect(
      pool.query(
        `insert into public.activity_efforts (
          id, created_at, updated_at, profile_id, recorded_at, activity_category,
          effort_type, duration_seconds, unit, value, source, method, provenance
        ) values ($1, now(), now(), $2, now(), 'bike', 'power', 1200, 'watts',
          0, 'manual', 'profile_update_override', '{"override_state":"active"}'::jsonb)`,
        [randomUUID(), profileId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "activity_efforts_value_finite_positive_check",
    });
    const clearRecordedAt = new Date(
      Math.max(...tombstones.map((row) => row?.recorded_at.getTime() ?? 0)),
    );
    const beforeClear = new Date(
      Math.min(...tombstones.map((row) => row?.recorded_at.getTime() ?? 0)) - 1,
    );
    const afterClear = new Date(clearRecordedAt.getTime() + 1);
    const batchEvidence = await analysisStore.loadContextEvidence?.({
      requests: [
        { profileId, asOf: beforeClear },
        { profileId, asOf: afterClear },
      ],
    });
    const sharedEvidence = batchEvidence?.get(profileId);
    expect(sharedEvidence).toBeDefined();
    if (!sharedEvidence) throw new Error("Expected batched profile evidence");
    expect(await getSerializedProfile(db, profileId)).toMatchObject({
      weight_kg: null,
      threshold_hr: null,
      ftp: null,
    });
    const profileCaller = profilesRouter.createCaller(
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
    await expect(profileCaller.getZones()).resolves.toMatchObject({
      powerZones: null,
      profile: { weight_kg: undefined, threshold_hr: undefined, ftp: undefined },
    });
    await expect(
      deriveProfileAwareCreationContext({
        db,
        store: analysisStore,
        profileId,
        asOfIso: afterClear.toISOString(),
      }),
    ).resolves.toMatchObject({
      contextSummary: {
        missing_optional_calibration_fields: expect.arrayContaining([
          "weight_kg",
          "threshold_hr",
          "ftp",
        ]),
      },
    });
    await expect(
      resolveActivityContextAsOf({
        store: analysisStore,
        profileId,
        activityTimestamp: afterClear,
      }),
    ).resolves.toMatchObject({
      profileMetrics: { weight_kg: null, lthr: null, ftp: null },
    });
    await expect(
      resolveActivityContextAsOf({
        store: analysisStore,
        profileId,
        activityTimestamp: beforeClear,
      }),
    ).resolves.toMatchObject({
      profileMetrics: { weight_kg: 69, lthr: 182, ftp: 310 },
    });
    expect(
      resolveActivityContextFromEvidence({
        evidence: sharedEvidence,
        activityTimestamp: beforeClear,
      }).profileMetrics,
    ).toMatchObject({ weight_kg: 69, lthr: 182, ftp: 310 });
    expect(
      resolveActivityContextFromEvidence({
        evidence: sharedEvidence,
        activityTimestamp: afterClear,
      }).profileMetrics,
    ).toMatchObject({ weight_kg: null, lthr: null, ftp: null });

    await updateProfile(db, { profileId, weight_kg: null, threshold_hr: null, ftp: null });
    expect(await manualMetrics(profileId, "weight_kg")).toHaveLength(3);
    expect(await manualMetrics(profileId, "lthr")).toHaveLength(2);
    expect(await manualFtp(profileId)).toHaveLength(3);

    await updateProfile(db, { profileId, weight_kg: 71, threshold_hr: 185, ftp: 320 });
    const reactivatedAt = new Date(Date.now() + 5);
    expect(await getSerializedProfile(db, profileId)).toMatchObject({
      weight_kg: 71,
      threshold_hr: 185,
      ftp: 320,
    });
    await expect(
      resolveActivityContextAsOf({
        store: analysisStore,
        profileId,
        activityTimestamp: reactivatedAt,
      }),
    ).resolves.toMatchObject({
      profileMetrics: { weight_kg: 71, lthr: 185, ftp: 320 },
    });
    await expect(
      resolveActivityContextAsOf({
        store: analysisStore,
        profileId,
        activityTimestamp: afterClear,
      }),
    ).resolves.toMatchObject({
      profileMetrics: { weight_kg: null, lthr: null, ftp: null },
    });
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
