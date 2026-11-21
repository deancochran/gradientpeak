import { randomUUID } from "node:crypto";
import { activityPlanSemanticHash, activityPlanStructureSchema } from "@repo/core/activity-plan";
import {
  PLANNED_SESSION_CONTRACT_VERSION,
  plannedSessionIdempotencyKey,
  plannedSessionSchema,
} from "@repo/core/calendar";
import { db, pool } from "@repo/db/client";
import { activityPlans } from "@repo/db/schema";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDrizzlePlannedSessionRepository } from "../../infrastructure/repositories";
import { activityPlanStructureHash } from "../activity-plans/structure-hash";
import { activeCalendarRelationship, caller, person } from "./delegated-calendar.live-db.fixtures";

const structure = activityPlanStructureSchema.parse({
  version: 5,
  activity_category: "run",
  items: [
    {
      type: "step",
      id: "88888888-8888-4888-8888-888888888888",
      name: "Steady",
      duration: { type: "time", seconds: 600 },
      targets: [{ type: "RPE", intensity: 5 }],
    },
  ],
});

describe("delegated calendar disposable contract", () => {
  it("reads only the consented selected-organization planned-session projection", async () => {
    const athleteId = await person("Calendar athlete");
    const coachId = await person("Calendar coach");
    const { organizationId } = await activeCalendarRelationship(coachId, athleteId);
    const activityPlanId = randomUUID();
    await db.insert(activityPlans).values({
      id: activityPlanId,
      name: "Private plan title",
      profile_id: athleteId,
      semantic_hash: activityPlanSemanticHash({ structure, trainingIntent: "general_maintenance" }),
      structure,
      structure_hash: activityPlanStructureHash(structure),
    });
    const source = {
      kind: "direct" as const,
      operationId: "delegated-calendar-read-operation-0001",
    };
    const session = plannedSessionSchema.parse({
      activityPlanId,
      contractVersion: PLANNED_SESSION_CONTRACT_VERSION,
      id: randomUUID(),
      idempotencyKey: plannedSessionIdempotencyKey(source),
      lifecycle: { status: "scheduled" },
      originalTargetDate: "2026-11-04",
      planningDate: "2026-11-04",
      profileId: athleteId,
      sessionRevision: 1,
      source,
    });
    await createDrizzlePlannedSessionRepository(db).createOwned({ profileId: athleteId, session });

    const coach = await caller(coachId);
    await expect(
      coach.calendar.coachAthleteRange({
        athleteProfileId: athleteId,
        endDateExclusive: "2026-11-10",
        organizationId,
        startDate: "2026-11-03",
      }),
    ).resolves.toEqual({
      nextCursor: null,
      projection: {
        events: [
          {
            activityCategory: "run",
            activityPlanId,
            eventId: session.id,
            planningDate: "2026-11-04",
            status: "scheduled",
          },
        ],
      },
      source: "planned_sessions",
      truncated: false,
    });
    await expect(
      coach.calendar.coachAthleteRange({
        athleteProfileId: athleteId,
        endDateExclusive: "2026-11-10",
        organizationId: randomUUID(),
        startDate: "2026-11-03",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies the endpoint for every current calendar-authority terminal state", async () => {
    const cases: Array<{
      name: string;
      options?: Parameters<typeof activeCalendarRelationship>[2];
      mutate?: (ids: Awaited<ReturnType<typeof activeCalendarRelationship>>) => Promise<void>;
    }> = [
      { name: "missing calendar consent", options: { includeConsent: false } },
      {
        name: "ended calendar consent",
        mutate: async ({ organizationId }) => {
          await db.execute(sql`update athlete_data_sharing_consents set ended_at = now()
            where organization_id = ${organizationId}::uuid`);
        },
      },
      { name: "expired calendar consent", options: { expiredConsent: true } },
      { name: "training-only consent", options: { scope: "training" } },
      {
        name: "closed organization",
        mutate: async ({ organizationId }) => {
          await db.execute(
            sql`update organizations set closed_at = now() where id = ${organizationId}::uuid`,
          );
        },
      },
      {
        name: "suspended organization",
        mutate: async ({ organizationId }) => {
          await db.execute(
            sql`update organizations set suspended_at = now() where id = ${organizationId}::uuid`,
          );
        },
      },
      {
        name: "suspended membership",
        mutate: async ({ membershipId }) => {
          await db.execute(
            sql`update organization_memberships set suspended_at = now() where id = ${membershipId}::uuid`,
          );
        },
      },
      {
        name: "revoked coach role",
        mutate: async ({ membershipId, organizationId }) => {
          await db.execute(sql`update organization_membership_role_grants set revoked_at = now()
            where organization_id = ${organizationId}::uuid and membership_id = ${membershipId}::uuid and role_key = 'coach'`);
        },
      },
      {
        name: "ended assignment",
        mutate: async ({ engagementId, organizationId }) => {
          await db.execute(sql`update coaching_assignments set ended_at = now()
            where organization_id = ${organizationId}::uuid and engagement_id = ${engagementId}::uuid`);
        },
      },
    ];
    for (const testCase of cases) {
      const athleteId = await person(`Denied athlete ${testCase.name}`);
      const coachId = await person(`Denied coach ${testCase.name}`);
      const relationship = await activeCalendarRelationship(coachId, athleteId, testCase.options);
      await testCase.mutate?.(relationship);
      const coach = await caller(coachId);
      await expect(
        coach.calendar.coachAthleteRange({
          athleteProfileId: athleteId,
          endDateExclusive: "2026-11-10",
          organizationId: relationship.organizationId,
          startDate: "2026-11-03",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });

  it("pages same-day and adjacent planned-session identities without gaps or end-exclusive leakage", async () => {
    const athleteId = await person("Pagination athlete");
    const coachId = await person("Pagination coach");
    const { organizationId } = await activeCalendarRelationship(coachId, athleteId);
    const activityPlanId = randomUUID();
    await db.insert(activityPlans).values({
      id: activityPlanId,
      name: "Private pagination plan",
      profile_id: athleteId,
      semantic_hash: activityPlanSemanticHash({ structure, trainingIntent: "general_maintenance" }),
      structure,
      structure_hash: activityPlanStructureHash(structure),
    });
    const sessions = await Promise.all(
      ["2026-11-04", "2026-11-04", "2026-11-05", "2026-11-10"].map(async (planningDate, index) => {
        const source = {
          kind: "direct" as const,
          operationId: `delegated-calendar-page-${index}-operation-0001`,
        };
        const session = plannedSessionSchema.parse({
          activityPlanId,
          contractVersion: PLANNED_SESSION_CONTRACT_VERSION,
          id: randomUUID(),
          idempotencyKey: plannedSessionIdempotencyKey(source),
          lifecycle: { status: "scheduled" },
          originalTargetDate: planningDate,
          planningDate,
          profileId: athleteId,
          sessionRevision: 1,
          source,
        });
        await createDrizzlePlannedSessionRepository(db).createOwned({
          profileId: athleteId,
          session,
        });
        return session;
      }),
    );
    const expected = sessions
      .filter((session) => session.planningDate < "2026-11-10")
      .sort(
        (left, right) =>
          left.planningDate.localeCompare(right.planningDate) || left.id.localeCompare(right.id),
      )
      .map((session) => session.id);
    const coach = await caller(coachId);
    const seen: string[] = [];
    let cursor: { eventId: string; planningDate: string } | null = null;
    let pages = 0;
    do {
      const page = await coach.calendar.coachAthleteRange({
        athleteProfileId: athleteId,
        cursor,
        endDateExclusive: "2026-11-10",
        limit: 2,
        organizationId,
        startDate: "2026-11-03",
      });
      pages++;
      seen.push(...page.projection.events.map((event) => event.eventId));
      expect(page.truncated).toBe(page.nextCursor !== null);
      cursor = page.nextCursor;
    } while (cursor);
    expect(pages).toBe(2);
    expect(seen).toEqual(expected);
    expect(new Set(seen)).toHaveLength(seen.length);
  });
});

afterAll(async () => pool.end());
