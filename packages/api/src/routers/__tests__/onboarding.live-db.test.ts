import { randomUUID } from "node:crypto";
import { athletePreferenceProfileSchema, defaultAthletePreferenceProfile } from "@repo/core";
import { db, pool } from "@repo/db/client";
import {
  activityEfforts,
  profileMetrics,
  profiles,
  profileTrainingSettings,
  users,
} from "@repo/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { createApiContext } from "../../context";
import { onboardingRouter } from "../onboarding";

const seededUserIds: string[] = [];

afterEach(async () => {
  while (seededUserIds.length > 0) {
    const userId = seededUserIds.pop();
    if (!userId) continue;
    await db.delete(activityEfforts).where(eq(activityEfforts.profile_id, userId));
    await db.delete(profileMetrics).where(eq(profileMetrics.profile_id, userId));
    await db.delete(profileTrainingSettings).where(eq(profileTrainingSettings.profile_id, userId));
    await db.delete(profiles).where(eq(profiles.id, userId));
    await db.delete(users).where(eq(users.id, userId));
  }
});

afterAll(async () => pool.end());

describe("onboarding persistence against PostgreSQL", () => {
  it("roundtrips selected intents while preserving existing profile settings", async () => {
    const userId = randomUUID();
    const email = `${userId}@onboarding-live.test`;
    const now = new Date();
    seededUserIds.push(userId);

    await db.insert(users).values({
      id: userId,
      name: "Onboarding Live Test",
      email,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(profiles).values({
      id: userId,
      email,
      full_name: "Before Onboarding",
      username: `onboarding-${userId.slice(0, 8)}`,
      onboarded: false,
      is_public: true,
      created_at: now,
      updated_at: now,
    });
    const existingSettings = {
      ...defaultAthletePreferenceProfile,
      training_style: {
        ...defaultAthletePreferenceProfile.training_style,
        progression_pace: 0.8,
      },
    };
    await db.insert(profileTrainingSettings).values({
      profile_id: userId,
      settings: existingSettings,
      updated_at: now,
    });

    const caller = onboardingRouter.createCaller(
      await createApiContext({
        db,
        headers: new Headers({ "x-client-type": "mobile" }),
        auth: {
          session: {
            sessionId: randomUUID(),
            transport: "cookie",
            user: { id: userId, email, emailVerified: true },
          },
        },
      }),
    );
    await caller.completeOnboarding({
      full_name: "Onboarded Athlete",
      username: `ready-${userId.slice(0, 8)}`,
      intents: ["improve_fitness", "track_activities"],
    });

    const [stored] = await db
      .select({ settings: profileTrainingSettings.settings })
      .from(profileTrainingSettings)
      .where(eq(profileTrainingSettings.profile_id, userId));
    const parsed = athletePreferenceProfileSchema.parse(stored?.settings);
    expect(parsed.onboarding_intents).toEqual(["improve_fitness", "track_activities"]);
    expect(parsed.training_style.progression_pace).toBe(0.8);
  });

  it("rolls back profile, settings, metrics, and efforts when a late write fails", async () => {
    const userId = randomUUID();
    const email = `${userId}@onboarding-rollback-live.test`;
    const now = new Date();
    const suffix = userId.replaceAll("-", "");
    const triggerName = `fail_onboarding_effort_${suffix}`;
    const functionName = `fail_onboarding_effort_fn_${suffix}`;
    seededUserIds.push(userId);

    await db.insert(users).values({
      id: userId,
      name: "Onboarding Rollback Test",
      email,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(profiles).values({
      id: userId,
      email,
      full_name: "Before Rollback",
      username: `rollback-${userId.slice(0, 8)}`,
      onboarded: false,
      is_public: true,
      created_at: now,
      updated_at: now,
    });
    const existingSettings = {
      ...defaultAthletePreferenceProfile,
      onboarding_intents: ["explore"] as const,
    };
    await db.insert(profileTrainingSettings).values({
      profile_id: userId,
      settings: existingSettings,
      updated_at: now,
    });

    const caller = onboardingRouter.createCaller(
      await createApiContext({
        db,
        headers: new Headers({ "x-client-type": "mobile" }),
        auth: {
          session: {
            sessionId: randomUUID(),
            transport: "cookie",
            user: { id: userId, email, emailVerified: true },
          },
        },
      }),
    );

    await db.execute(
      sql.raw(`
        create function ${functionName}() returns trigger language plpgsql as $$
        begin
          if new.profile_id = '${userId}'::uuid then
            raise exception 'forced onboarding effort failure';
          end if;
          return new;
        end;
        $$;
        create trigger ${triggerName}
          before insert on activity_efforts
          for each row execute function ${functionName}();
      `),
    );

    try {
      await expect(
        caller.completeOnboarding({
          full_name: "Should Roll Back",
          username: `rolled-${userId.slice(0, 8)}`,
          intents: ["train_event"],
          ftp: 250,
        }),
      ).rejects.toThrow("Failed to insert onboarding efforts");
    } finally {
      await db.execute(sql.raw(`drop trigger if exists ${triggerName} on activity_efforts`));
      await db.execute(sql.raw(`drop function if exists ${functionName}()`));
    }

    const [storedProfile] = await db
      .select({ fullName: profiles.full_name, onboarded: profiles.onboarded })
      .from(profiles)
      .where(eq(profiles.id, userId));
    const [storedSettings] = await db
      .select({ settings: profileTrainingSettings.settings })
      .from(profileTrainingSettings)
      .where(eq(profileTrainingSettings.profile_id, userId));
    const storedMetrics = await db
      .select({ id: profileMetrics.id })
      .from(profileMetrics)
      .where(eq(profileMetrics.profile_id, userId));
    const storedEfforts = await db
      .select({ id: activityEfforts.id })
      .from(activityEfforts)
      .where(eq(activityEfforts.profile_id, userId));

    expect(storedProfile).toEqual({ fullName: "Before Rollback", onboarded: false });
    expect(
      athletePreferenceProfileSchema.parse(storedSettings?.settings).onboarding_intents,
    ).toEqual(["explore"]);
    expect(storedMetrics).toEqual([]);
    expect(storedEfforts).toEqual([]);
  });
});
