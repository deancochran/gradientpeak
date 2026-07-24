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

    await caller.update({ weight_kg: "" });
    expect(await getSerializedProfile(db, profileId)).toMatchObject({
      weight_kg: null,
    });
    const weightHistory = await manualMetrics(profileId, "weight_kg");
    expect(weightHistory).toHaveLength(2);
    expect(weightHistory.some((row) => row.value === 70.5)).toBe(true);
    expect(weightHistory.some(isClearedProfileOverride)).toBe(true);

    for (const input of [
      { threshold_hr: "180" },
      { threshold_hr: " " },
      { threshold_hr: null },
      { ftp: "300" },
      { ftp: "" },
      { ftp: null },
    ]) {
      await expect(caller.update(input as never)).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    expect(await manualMetrics(profileId, "lthr")).toEqual([]);
    expect(
      await db
        .select()
        .from(activityEfforts)
        .where(and(eq(activityEfforts.profile_id, profileId), isNull(activityEfforts.activity_id))),
    ).toEqual([]);
  });

  it("strictly bounds zero effort tombstones despite nullable evidence metadata", async () => {
    const profileId = await seedProfile(`effort-check-${randomUUID().slice(0, 8)}`);
    const insertEffort = (input: {
      value: number | string;
      source: string | null;
      method: string | null;
      provenance: Record<string, unknown> | null;
    }) =>
      pool.query(
        `insert into public.activity_efforts (
          id, created_at, updated_at, profile_id, recorded_at, activity_category,
          effort_type, duration_seconds, unit, value, source, method, provenance
        ) values ($1, now(), now(), $2, now(), 'bike', 'power', 1200, 'watts',
          $3::real, $4, $5, $6::jsonb)`,
        [
          randomUUID(),
          profileId,
          input.value,
          input.source,
          input.method,
          input.provenance === null ? null : JSON.stringify(input.provenance),
        ],
      );

    await expect(
      insertEffort({
        value: 0,
        source: "manual",
        method: "profile_update_override",
        provenance: { override_state: "cleared" },
      }),
    ).resolves.toBeDefined();
    await expect(
      insertEffort({ value: 250, source: null, method: null, provenance: null }),
    ).resolves.toBeDefined();

    const invalidZeroCases = [
      {
        value: 0,
        source: null,
        method: "profile_update_override",
        provenance: { override_state: "cleared" },
      },
      {
        value: 0,
        source: "manual",
        method: null,
        provenance: { override_state: "cleared" },
      },
      { value: 0, source: "manual", method: "profile_update_override", provenance: null },
      { value: 0, source: "manual", method: "profile_update_override", provenance: {} },
      {
        value: 0,
        source: "manual",
        method: "profile_update_override",
        provenance: { override_state: null },
      },
      {
        value: 0,
        source: "manual",
        method: "profile_update_override",
        provenance: { override_state: "active" },
      },
      {
        value: 0,
        source: "manual",
        method: "manual_activity_effort_entry",
        provenance: { override_state: "cleared" },
      },
    ] as const;
    for (const invalid of invalidZeroCases) {
      await expect(insertEffort(invalid)).rejects.toMatchObject({
        code: "23514",
        constraint: "activity_efforts_value_finite_positive_check",
      });
    }
    for (const value of ["NaN", "Infinity", "-Infinity"] as const) {
      await expect(
        insertEffort({ value, source: null, method: null, provenance: null }),
      ).rejects.toMatchObject({ code: "23514" });
    }
  });

  it("keeps append-only weight history and agrees across profile and as-of activity analysis", async () => {
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

    await updateProfile(db, { profileId, weight_kg: null });
    const weightHistory = await manualMetrics(profileId, "weight_kg");
    expect(weightHistory).toHaveLength(3);
    expect(weightHistory.some((row) => row.value === 68.2)).toBe(true);
    const clear = weightHistory.find(isClearedProfileOverride);
    expect(clear).toBeDefined();
    if (!clear) throw new Error("Expected weight tombstone");
    const beforeClear = new Date(clear.recorded_at.getTime() - 1);
    const afterClear = new Date(clear.recorded_at.getTime() + 1);

    await updateProfile(db, { profileId, weight_kg: null });
    expect(await manualMetrics(profileId, "weight_kg")).toHaveLength(3);

    await updateProfile(db, { profileId, weight_kg: 71 });
    const reactivatedHistory = await manualMetrics(profileId, "weight_kg");
    expect(reactivatedHistory).toHaveLength(4);
    const reactivation = reactivatedHistory.find((row) => row.value === 71);
    expect(reactivation).toBeDefined();
    if (!reactivation) throw new Error("Expected reactivated weight observation");
    const afterReactivation = new Date(reactivation.recorded_at.getTime() + 1);

    const batchEvidence = await analysisStore.loadContextEvidence?.({
      requests: [
        { profileId, asOf: beforeClear },
        { profileId, asOf: afterClear },
        { profileId, asOf: afterReactivation },
      ],
    });
    const sharedEvidence = batchEvidence?.get(profileId);
    expect(sharedEvidence).toBeDefined();
    if (!sharedEvidence) throw new Error("Expected batched profile evidence");
    expect(await getSerializedProfile(db, profileId)).toMatchObject({
      weight_kg: 71,
      threshold_hr: null,
      ftp: null,
    });
    await expect(
      resolveActivityContextAsOf({
        store: analysisStore,
        profileId,
        activityTimestamp: afterClear,
      }),
    ).resolves.toMatchObject({
      profileMetrics: { weight_kg: null, ftp: null },
    });
    await expect(
      resolveActivityContextAsOf({
        store: analysisStore,
        profileId,
        activityTimestamp: beforeClear,
      }),
    ).resolves.toMatchObject({
      profileMetrics: { weight_kg: 69, ftp: null },
    });
    expect(
      resolveActivityContextFromEvidence({
        evidence: sharedEvidence,
        activityTimestamp: beforeClear,
      }).profileMetrics,
    ).toMatchObject({ weight_kg: 69, ftp: null });
    expect(
      resolveActivityContextFromEvidence({
        evidence: sharedEvidence,
        activityTimestamp: afterClear,
      }).profileMetrics,
    ).toMatchObject({ weight_kg: null, ftp: null });

    await expect(
      resolveActivityContextAsOf({
        store: analysisStore,
        profileId,
        activityTimestamp: afterReactivation,
      }),
    ).resolves.toMatchObject({
      profileMetrics: { weight_kg: 71, ftp: null },
    });
    expect(
      resolveActivityContextFromEvidence({
        evidence: sharedEvidence,
        activityTimestamp: afterReactivation,
      }).profileMetrics,
    ).toMatchObject({ weight_kg: 71, ftp: null });

    const [profileBeforeRejectedThresholds] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, profileId));
    await expect(updateProfile(db, { profileId, bio: "rejected", ftp: 300 })).rejects.toThrow(
      "Training thresholds are calculated from trusted activity evidence.",
    );
    await expect(
      updateProfile(db, { profileId, bio: "rejected", threshold_hr: 180 }),
    ).rejects.toThrow("Training thresholds are calculated from trusted activity evidence.");
    expect(await manualMetrics(profileId, "weight_kg")).toEqual(reactivatedHistory);
    expect(await manualMetrics(profileId, "lthr")).toEqual([]);
    expect(
      await db.select().from(activityEfforts).where(eq(activityEfforts.profile_id, profileId)),
    ).toEqual([]);
    expect(await db.select().from(profiles).where(eq(profiles.id, profileId))).toEqual([
      profileBeforeRejectedThresholds,
    ]);
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
