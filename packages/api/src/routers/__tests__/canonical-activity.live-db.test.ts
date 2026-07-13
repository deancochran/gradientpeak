import { randomUUID } from "node:crypto";
import { db, pool } from "@repo/db/client";
import { activities, activityFileIngestions, integrations, profiles, users } from "@repo/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  type ActivitySubmission,
  submitActivity,
} from "../../application/activities/submit-activity";
import { createActivityFileIngestion } from "../../application/activity-file-ingestion/ingestion-state";

const seededUserIds: string[] = [];

async function seedProfile() {
  const id = randomUUID();
  const email = `${id}@canonical-activity.test`;
  const now = new Date();
  await db.insert(users).values({
    id,
    name: "Canonical Activity Test",
    email,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(profiles).values({
    id,
    email,
    full_name: "Canonical Activity Test",
    username: `canonical-${id.slice(0, 8)}`,
    onboarded: true,
    created_at: now,
    updated_at: now,
  });
  seededUserIds.push(id);
  return id;
}

function submission(
  profileId: string,
  overrides: Partial<ActivitySubmission> = {},
): ActivitySubmission {
  return {
    profileId,
    name: `Canonical ${randomUUID()}`,
    notes: null,
    activityType: "bike",
    isPrivate: true,
    startedAt: new Date("2026-01-01T10:00:00Z"),
    finishedAt: new Date("2026-01-01T11:00:00Z"),
    durationSeconds: 3600,
    movingSeconds: 3500,
    distanceMeters: 20_000,
    calories: null,
    elevationGainMeters: null,
    avgHeartRate: null,
    maxHeartRate: null,
    avgPower: null,
    maxPower: null,
    normalizedPower: null,
    avgCadence: null,
    maxCadence: null,
    avgSpeedMps: null,
    maxSpeedMps: null,
    normalizedSpeedMps: null,
    normalizedGradedSpeedMps: null,
    efficiencyFactor: null,
    aerobicDecoupling: null,
    avgTemperature: null,
    deviceManufacturer: null,
    deviceProduct: null,
    laps: null,
    mapBounds: null,
    polyline: null,
    ...overrides,
  };
}

afterEach(async () => {
  while (seededUserIds.length) {
    const id = seededUserIds.pop();
    if (id) {
      await db.delete(profiles).where(eq(profiles.id, id));
      await db.delete(users).where(eq(users.id, id));
    }
  }
});
afterAll(async () => pool.end());

describe("canonical activity persistence against PostgreSQL", () => {
  it("rolls back the complete projection when composed persistence fails", async () => {
    const profileId = await seedProfile();
    const name = `Rollback ${randomUUID()}`;
    await expect(
      submitActivity(db, {
        ...submission(profileId),
        name,
        composition: {
          persist: async () => {
            throw new Error("composition failed");
          },
        },
      }),
    ).rejects.toThrow("composition failed");
    expect(await db.select().from(activities).where(eq(activities.name, name))).toEqual([]);
  });

  it("ownership-scopes and atomically upserts an existing activity projection", async () => {
    const profileId = await seedProfile();
    const otherProfileId = await seedProfile();
    const created = await submitActivity(db, submission(profileId));
    const enrichment = {
      kind: "enrich" as const,
      activityId: created.id,
      profileId,
      activityFilePath: "enriched.fit",
      activityFileSize: 99,
      activityFileType: "fit" as const,
      deviceManufacturer: "Wahoo",
      deviceProduct: "ELEMNT",
      laps: [],
      mapBounds: null,
      polyline: "encoded-line",
      summaryValues: {
        activity_id: created.id,
        profile_id: profileId,
        duration_seconds: 3700,
        moving_seconds: 3600,
        distance_meters: 21_000,
      },
      efforts: [],
      detectedLTHR: null,
      activityCompletedAt: new Date("2026-01-01T11:01:40Z"),
      activityPlanId: null,
      name: "Enriched activity",
      notes: "updated",
      activityType: "run",
      isPrivate: false,
      startedAt: new Date("2026-01-01T10:01:00Z"),
      finishedAt: new Date("2026-01-01T11:01:40Z"),
    };
    await submitActivity(db, enrichment);
    const [activity] = await db.select().from(activities).where(eq(activities.id, created.id));
    const [summary] = await db.select().from(activities).where(eq(activities.id, created.id));
    const [activityImport] = await db
      .select()
      .from(activities)
      .where(eq(activities.id, created.id));
    const [geometry] = await db.select().from(activities).where(eq(activities.id, created.id));
    expect(activity).toMatchObject({
      profile_id: profileId,
      name: "Enriched activity",
      notes: "updated",
      type: "run",
      is_private: false,
      activity_plan_id: null,
    });
    expect(summary).toMatchObject({
      profile_id: profileId,
      duration_seconds: 3700,
      distance_meters: 21_000,
    });
    expect(activityImport).toMatchObject({
      profile_id: profileId,
      activity_file_path: "enriched.fit",
    });
    expect(geometry).toMatchObject({ profile_id: profileId, polyline: "encoded-line" });

    await expect(submitActivity(db, { ...enrichment, profileId: otherProfileId })).rejects.toThrow(
      "Activity not found for profile",
    );
    expect(
      await db
        .select()
        .from(activities)
        .where(and(eq(activities.id, created.id), eq(activities.profile_id, otherProfileId))),
    ).toEqual([]);
  });

  it("enforces the provider identity unique constraint without partial second persistence", async () => {
    const profileId = await seedProfile();
    const [integration] = await db
      .insert(integrations)
      .values({ profile_id: profileId, provider: "wahoo", external_id: randomUUID() })
      .returning({ id: integrations.id });
    if (!integration) throw new Error("Failed to seed integration");
    const externalId = randomUUID();
    const provider = {
      provider: "wahoo" as const,
      externalId,
      integrationId: integration.id,
      providerUpdatedAt: null,
    };
    const first = await submitActivity(db, {
      ...submission(profileId),
      activityFilePath: "first.fit",
      activityFileSize: 1,
      providerProvenance: provider,
    });
    const duplicate = await submitActivity(db, {
      ...submission(profileId),
      activityFilePath: "second.fit",
      activityFileSize: 2,
      providerProvenance: provider,
    }).then(
      () => null,
      (error: unknown) => error,
    );
    expect(duplicate).toMatchObject({
      cause: {
        code: "23505",
        constraint: "idx_activities_provider_external_unique",
      },
    });
    const imports = await db
      .select()
      .from(activities)
      .where(eq(activities.external_id, externalId));
    expect(imports).toHaveLength(1);
    expect(imports[0]?.id).toBe(first.id);
  });

  it("commits recording ingestion with its activity projection", async (context) => {
    const drift = await db.execute(sql`
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'activity_file_ingestions'
        and column_name in ('operation_key', 'processing_claim_token', 'processing_lease_expires_at')
      limit 1
    `);
    if (drift.rows.length > 0) {
      console.warn(
        "Skipping recording ingestion live test: connected DB still needs the compensating ingestion-column migration",
      );
      context.skip();
      return;
    }
    const profileId = await seedProfile();
    const created = await submitActivity(db, {
      ...submission(profileId),
      composition: {
        persist: (tx, { activityId, now }) =>
          createActivityFileIngestion(tx, {
            activityId,
            profileId,
            source: "mobile_recording",
            filePath: null,
            fileSize: 42,
            fileType: "fit",
            now,
          }),
      },
    });
    const rows = await db
      .select()
      .from(activityFileIngestions)
      .where(eq(activityFileIngestions.activity_id, created.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "pending_upload", source: "mobile_recording" });
  });
});
