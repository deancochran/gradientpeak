import { randomUUID } from "node:crypto";
import { activityPlanSemanticHash, activityPlanStructureSchema } from "@repo/core/activity-plan";
import { db, pool } from "@repo/db/client";
import {
  activities,
  activityPlans,
  manualTrainingDiaryOperations,
  plannedSessions,
  profiles,
  users,
} from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { createEventReadRepository } from "../../infrastructure/repositories/drizzle-event-read-repository";
import { createDrizzlePlannedSessionRepository } from "../../infrastructure/repositories/drizzle-planned-session-repository";
import { createManualDiaryEntry } from "../activities/create-manual-diary-entry";
import { activityPlanStructureHash } from "../activity-plans/structure-hash";
import { createDirectPlannedSession } from "../calendar/create-direct-planned-session";
import { readPlanningLedger } from "./planningLedgerService";
import { readPlanTabProjectionSnapshot } from "./planTabProjectionService";

function isDisposablePlannedSessionDatabase(): boolean {
  if (process.env.RUN_PLANNED_SESSION_LIVE_DB !== "1") return false;
  try {
    const url = new URL(process.env.DATABASE_URL ?? "");
    return (
      ["127.0.0.1", "localhost"].includes(url.hostname) &&
      url.port === "54322" &&
      /^\/gradientpeak_planned_sessions_\d+_\d+$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

const describeDisposable = isDisposablePlannedSessionDatabase() ? describe : describe.skip;
const profileIds: string[] = [];
const structure = activityPlanStructureSchema.parse({
  version: 5,
  activity_category: "run",
  items: [
    {
      type: "step",
      id: randomUUID(),
      name: "Rest",
      duration: { type: "time", seconds: 60 },
      targets: [{ type: "rest" }],
    },
  ],
});

async function seedProfile() {
  const profileId = randomUUID();
  profileIds.push(profileId);
  const email = `${profileId}@manual-completion-ledger.test`;
  await db
    .insert(users)
    .values({ id: profileId, name: "Manual ledger athlete", email, emailVerified: true });
  await db.insert(profiles).values({
    id: profileId,
    email,
    full_name: "Manual ledger athlete",
    username: `manual-${profileId.slice(0, 8)}`,
    onboarding_status: "completed",
    planning_timezone: "America/New_York",
    is_public: false,
  });
  return profileId;
}

afterEach(async () => {
  while (profileIds.length > 0) {
    const profileId = profileIds.pop();
    if (!profileId) continue;
    await db
      .delete(manualTrainingDiaryOperations)
      .where(eq(manualTrainingDiaryOperations.profile_id, profileId));
    await db.delete(plannedSessions).where(eq(plannedSessions.profile_id, profileId));
    await db.delete(activities).where(eq(activities.profile_id, profileId));
    await db.delete(activityPlans).where(eq(activityPlans.profile_id, profileId));
    await db.delete(profiles).where(eq(profiles.id, profileId));
    await db.delete(users).where(eq(users.id, profileId));
  }
});

afterAll(async () => pool.end());

describeDisposable("manual planned completion planning ledger", () => {
  it("keeps a null-timing linked manual completion visible on its planned day", async () => {
    const profileId = await seedProfile();
    const otherProfileId = await seedProfile();
    const activityPlanId = randomUUID();
    const sessionId = randomUUID();
    const outsideSessionId = randomUUID();
    const asOf = new Date("2026-08-20T16:00:00.000Z");
    await db.insert(activityPlans).values({
      id: activityPlanId,
      profile_id: profileId,
      name: "Manual rest run",
      structure,
      structure_hash: activityPlanStructureHash(structure),
      semantic_hash: activityPlanSemanticHash({
        structure,
        trainingIntent: "general_maintenance",
      }),
    });
    await createDirectPlannedSession({
      db,
      repository: createDrizzlePlannedSessionRepository(db),
      profileId,
      sessionId,
      planningDate: "2026-08-20",
      source: { kind: "direct", operationId: randomUUID() },
      activityPlanId,
      groupEventId: null,
      capturedAt: asOf,
    });
    const completion = await createManualDiaryEntry({
      db,
      profileId,
      now: asOf,
      plannedSession: { sessionId, expectedRevision: 1, outcome: "full" },
      observation: {
        operationId: randomUUID(),
        diaryDate: "2026-08-20",
        diaryTimezone: "America/New_York",
        name: "Manual rest run",
        activityCategory: "run",
      },
    });
    const timestamped = await createManualDiaryEntry({
      db,
      profileId,
      now: asOf,
      observation: {
        operationId: randomUUID(),
        diaryDate: "2026-08-20",
        diaryTimezone: "America/New_York",
        name: "Timestamped manual run",
        activityCategory: "run",
        startedAt: "2026-08-20T15:00:00.000Z",
        finishedAt: "2026-08-20T15:01:00.000Z",
        elapsedMs: 60_000,
      },
    });
    const otherProfileActivity = await createManualDiaryEntry({
      db,
      profileId: otherProfileId,
      now: asOf,
      observation: {
        operationId: randomUUID(),
        diaryDate: "2026-08-20",
        diaryTimezone: "America/New_York",
        name: "Other athlete run",
        activityCategory: "run",
        startedAt: "2026-08-20T15:00:00.000Z",
        finishedAt: "2026-08-20T15:01:00.000Z",
        elapsedMs: 60_000,
      },
    });
    const outsideAsOf = new Date("2026-08-21T16:00:00.000Z");
    await createDirectPlannedSession({
      db,
      repository: createDrizzlePlannedSessionRepository(db),
      profileId,
      sessionId: outsideSessionId,
      planningDate: "2026-08-21",
      source: { kind: "direct", operationId: randomUUID() },
      activityPlanId,
      groupEventId: null,
      capturedAt: outsideAsOf,
    });
    const outsideCompletion = await createManualDiaryEntry({
      db,
      profileId,
      now: outsideAsOf,
      plannedSession: { sessionId: outsideSessionId, expectedRevision: 1, outcome: "full" },
      observation: {
        operationId: randomUUID(),
        diaryDate: "2026-08-21",
        diaryTimezone: "America/New_York",
        name: "Outside window manual run",
        activityCategory: "run",
      },
    });

    expect(completion.activity).toMatchObject({
      id: expect.any(String),
      started_at: null,
      finished_at: null,
      elapsed_ms: null,
      distance_meters: null,
    });
    const effectiveInputs = await createEventReadRepository(db).getEffectivePlanLoadInputs({
      profileId,
      startDate: "2026-08-20",
      endDate: "2026-08-20",
      asOf,
    });
    const effectiveActivityIds = effectiveInputs.activities.map((activity) => activity.id);
    expect(effectiveActivityIds).toEqual(
      expect.arrayContaining([completion.activity.id, timestamped.activity.id]),
    );
    expect(effectiveActivityIds).not.toContain(outsideCompletion.activity.id);
    expect(effectiveActivityIds).not.toContain(otherProfileActivity.activity.id);
    const projection = await readPlanTabProjectionSnapshot({
      db,
      profileId,
      request: { startDate: "2026-08-20", endDate: "2026-08-20" },
      asOf,
    });
    const ledger = await readPlanningLedger({
      db,
      profileId,
      request: { period: "day", anchorDate: "2026-08-20" },
      asOf,
    });

    expect(projection.ledgerItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: completion.activity.id,
          date: "2026-08-20",
          kind: "completed",
          loadStatus: "unavailable",
          load: null,
          intensityStatus: "unavailable",
          intensity: null,
          contributingDurationStatus: "unavailable",
          contributingDurationSeconds: null,
        }),
      ]),
    );
    expect(ledger.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: completion.activity.id,
          date: "2026-08-20",
          kind: "completed",
          navigation: { target: "activity", id: completion.activity.id },
          load: { status: "unavailable", value: null },
          intensity: { status: "unavailable", value: null },
          contributingDurationSeconds: { status: "unavailable", value: null },
        }),
      ]),
    );
  });
});
