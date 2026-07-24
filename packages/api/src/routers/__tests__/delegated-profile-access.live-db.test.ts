import { randomUUID } from "node:crypto";
import { defaultAthletePreferenceProfile } from "@repo/core";
import { db, pool } from "@repo/db/client";
import { sql } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { createApiContext } from "../../context";
import { appRouter } from "../index";

const ids: string[] = [];

async function seedProfile(label: string) {
  const id = randomUUID();
  const email = `${id}@delegated-access.test`;
  const now = new Date();
  await db.execute(sql`
    insert into users (id, name, email, email_verified, created_at, updated_at)
    values (${id}::uuid, ${label}, ${email}, true, ${now}, ${now})
  `);
  await db.execute(sql`
    insert into profiles (id, email, full_name, username, language, preferred_units, onboarded, is_public, created_at, updated_at)
    values (${id}::uuid, ${email}, ${label}, ${`delegate-${id.slice(0, 8)}`}, 'en', 'metric', true, true, ${now}, ${now})
  `);
  ids.push(id);
  return id;
}

async function createCaller(userId: string) {
  return appRouter.createCaller(
    await createApiContext({
      db,
      headers: new Headers({ "x-api-source": "vitest-live" }),
      auth: {
        session: {
          sessionId: randomUUID(),
          transport: "cookie",
          user: { id: userId, email: `${userId}@delegated-access.test`, emailVerified: true },
        },
      },
    }),
  );
}

async function activeRelationship(coachId: string, athleteId: string) {
  await db.execute(sql`
    insert into coaches_athletes (coach_id, athlete_id)
    values (${coachId}::uuid, ${athleteId}::uuid)
  `);
}

function goalInput(profileId: string, title: string) {
  return {
    profile_id: profileId,
    target_date: "2026-12-31",
    title,
    priority: 1,
    activity_category: "run" as const,
    target_payload: {
      type: "event_performance" as const,
      activity_category: "run" as const,
      distance_m: 5000,
      target_time_s: 1500,
    },
  };
}

async function readPersistedState(profileId: string, goalId: string) {
  const [settings, goals] = await Promise.all([
    db.execute(
      sql`select settings from profile_training_settings where profile_id = ${profileId}::uuid`,
    ),
    db.execute(sql`select title from profile_goals where id = ${goalId}::uuid`),
  ]);
  return { settings: settings.rows[0]?.settings, title: goals.rows[0]?.title };
}

async function waitForRelationshipLock(timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await pool.query<{ count: number }>(`
      select count(*)::int as count
      from pg_stat_activity
      where datname = current_database()
        and wait_event_type = 'Lock'
        and query ilike '%coaches_athletes%'
    `);
    if (Number(result.rows[0]?.count) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for the procedure to block on coaches_athletes");
}

async function within<T>(promise: Promise<T>, timeoutMs = 5_000): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

afterEach(async () => {
  while (ids.length) {
    const id = ids.pop();
    if (id) {
      await db.execute(sql`delete from profile_goals where profile_id = ${id}::uuid`);
      await db.execute(sql`delete from profile_training_settings where profile_id = ${id}::uuid`);
      await db.execute(
        sql`delete from coaches_athletes where coach_id = ${id}::uuid or athlete_id = ${id}::uuid`,
      );
      await db.execute(sql`delete from profiles where id = ${id}::uuid`);
      await db.execute(sql`delete from users where id = ${id}::uuid`);
    }
  }
});

afterAll(async () => pool.end());

describe("delegated profile write revocation through appRouter", () => {
  it("persists owner and active coach writes, then fails closed for every revoked delegated mutation", async () => {
    const athleteId = await seedProfile("Athlete");
    const coachId = await seedProfile("Coach");
    await activeRelationship(coachId, athleteId);
    const owner = await createCaller(athleteId);
    const coach = await createCaller(coachId);

    await owner.profileSettings.upsert({
      profile_id: athleteId,
      settings: defaultAthletePreferenceProfile,
    });
    await coach.profileSettings.upsert({
      profile_id: athleteId,
      settings: defaultAthletePreferenceProfile,
    });
    const goal = await coach.goals.create(goalInput(athleteId, "Active coach goal"));

    expect(await readPersistedState(athleteId, goal.id)).toEqual({
      settings: defaultAthletePreferenceProfile,
      title: "Active coach goal",
    });

    await expect(
      coach.profileAccess.revoke({ coach_id: coachId, athlete_id: athleteId }),
    ).resolves.toEqual({ revoked: true });

    await expect(
      coach.profileSettings.upsert({
        profile_id: athleteId,
        settings: defaultAthletePreferenceProfile,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      coach.goals.create(goalInput(athleteId, "Revoked coach goal")),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      coach.goals.update({ id: goal.id, data: { title: "Revoked update" } }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(coach.goals.delete({ id: goal.id })).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(await readPersistedState(athleteId, goal.id)).toEqual({
      settings: defaultAthletePreferenceProfile,
      title: "Active coach goal",
    });
  });

  it("rejects an unrelated caller from revoking an exact coach-athlete relationship", async () => {
    const athleteId = await seedProfile("Athlete");
    const coachId = await seedProfile("Coach");
    const unrelatedId = await seedProfile("Unrelated");
    await activeRelationship(coachId, athleteId);

    await expect(
      (await createCaller(unrelatedId)).profileAccess.revoke({
        coach_id: coachId,
        athlete_id: athleteId,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("commits a waiting delegated procedure before a later revoke", async () => {
    const athleteId = await seedProfile("Athlete");
    const coachId = await seedProfile("Coach");
    await activeRelationship(coachId, athleteId);
    const coach = await createCaller(coachId);
    const held = await pool.connect();
    let committed = false;

    try {
      await held.query("begin");
      await held.query(
        "select revision from coaches_athletes where coach_id = $1 and athlete_id = $2 for update",
        [coachId, athleteId],
      );
      const write = coach.profileSettings.upsert({
        profile_id: athleteId,
        settings: defaultAthletePreferenceProfile,
      });
      await waitForRelationshipLock();
      const revoke = coach.profileAccess.revoke({ coach_id: coachId, athlete_id: athleteId });

      await held.query("commit");
      committed = true;
      await expect(within(write)).resolves.toMatchObject({ profile_id: athleteId });
      await expect(within(revoke)).resolves.toEqual({ revoked: true });
    } finally {
      if (!committed) await held.query("rollback").catch(() => undefined);
      held.release();
    }

    const settings = await db.execute(
      sql`select settings from profile_training_settings where profile_id = ${athleteId}::uuid`,
    );
    expect(settings.rows[0]?.settings).toEqual(defaultAthletePreferenceProfile);
  }, 15_000);

  it("commits revoke before a later waiting delegated procedure, which then fails closed", async () => {
    const athleteId = await seedProfile("Athlete");
    const coachId = await seedProfile("Coach");
    await activeRelationship(coachId, athleteId);
    const coach = await createCaller(coachId);
    const held = await pool.connect();
    let committed = false;

    try {
      await held.query("begin");
      await held.query(
        "select revision from coaches_athletes where coach_id = $1 and athlete_id = $2 for update",
        [coachId, athleteId],
      );
      const revoke = coach.profileAccess.revoke({ coach_id: coachId, athlete_id: athleteId });
      await waitForRelationshipLock();
      const write = coach.goals.create(goalInput(athleteId, "Blocked by revoke"));

      await held.query("commit");
      committed = true;
      await expect(within(revoke)).resolves.toEqual({ revoked: true });
      await expect(within(write)).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally {
      if (!committed) await held.query("rollback").catch(() => undefined);
      held.release();
    }

    const goals = await db.execute(
      sql`select count(*)::int as count from profile_goals where profile_id = ${athleteId}::uuid`,
    );
    expect(goals.rows[0]?.count).toBe(0);
  }, 15_000);
});
