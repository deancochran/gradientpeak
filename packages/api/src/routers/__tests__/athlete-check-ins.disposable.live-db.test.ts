import { randomUUID } from "node:crypto";
import { createDbClient, type DrizzleDbClient } from "@repo/db/client";
import {
  checkInOccurrences,
  checkInSchedules,
  checkInSubmissions,
  checkInTemplates,
  checkInTemplateVersions,
  coachingEngagements,
  organizationMembershipRoleGrants,
  organizationMemberships,
  organizations,
  profiles,
  users,
} from "@repo/db/schema";
import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  requireFreshBaseline,
  withDisposableDatabase,
} from "@repo/db/testing/disposable-database";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Context } from "../../context";
import { appRouter } from "../index";

const questionId = "11111111-1111-4111-8111-111111111111";
const questions = [
  {
    audience: "athlete_and_assigned_coaches",
    helpText: null,
    kind: "scale_1_to_10",
    label: "Recovery",
    questionId,
    required: true,
  },
];
const answers = [{ questionId, kind: "scale_1_to_10" as const, value: 7 }];

function context(db: DrizzleDbClient, userId: string): Context {
  const session = {
    sessionId: `disposable-${userId}`,
    user: { id: userId, email: "disposable@example.test", emailVerified: true },
    transport: "cookie" as const,
  };
  return {
    auth: { lookupInput: { clientType: "web" }, session },
    authSession: session,
    clientType: "web",
    db,
    headers: new Headers(),
    session,
    trustedNetworkIdentity: undefined,
    trpcSource: "server",
  };
}
async function person(db: DrizzleDbClient, label: string) {
  const id = randomUUID();
  await db
    .insert(users)
    .values({ id, name: label, email: `${id}@check-in.test`, emailVerified: true });
  await db.insert(profiles).values({
    id,
    email: `${id}@check-in.test`,
    full_name: label,
    username: `${label}-${id.slice(0, 8)}`,
    onboarding_status: "completed",
    is_public: false,
  });
  return id;
}

describe("athlete check-ins against a fresh disposable PostgreSQL baseline", () => {
  it("fences private athlete data and proves submission, replay, lifecycle, concurrency and pagination", async () => {
    await withDisposableDatabase(
      ["--disposable", "--local"],
      "athlete_check_ins",
      async (pool, url) => {
        await bootstrapSupabaseSchemas(pool);
        for (const migration of requireFreshBaseline().migrationPaths)
          await applySqlFile(pool, migration);
        const client = createDbClient({ url });
        try {
          const owner = await person(client.db, "owner");
          const athlete = await person(client.db, "athlete");
          const stranger = await person(client.db, "stranger");
          const coach = await person(client.db, "coach");
          const administrator = await person(client.db, "administrator");
          const organizationId = randomUUID();
          await appRouter.createCaller(context(client.db, owner)).organizations.create({
            organizationId,
            name: "Check-ins",
            slug: `check-ins-${organizationId}`,
            timezone: "UTC",
          });
          const ownerMembership = (
            await client.db
              .select({ id: organizationMemberships.id })
              .from(organizationMemberships)
              .where(eq(organizationMemberships.profile_id, owner))
          )[0]?.id;
          if (!ownerMembership) throw new Error("owner membership fixture missing");
          const staff = async (profileId: string, role: "coach" | "admin") => {
            const membershipId = randomUUID();
            await client.db
              .insert(organizationMemberships)
              .values({ id: membershipId, organization_id: organizationId, profile_id: profileId });
            await client.db.insert(organizationMembershipRoleGrants).values({
              organization_id: organizationId,
              membership_id: membershipId,
              role_key: role,
            });
          };
          await staff(coach, "coach");
          await staff(administrator, "admin");
          const engagementId = randomUUID();
          await client.db.insert(coachingEngagements).values({
            id: engagementId,
            organization_id: organizationId,
            athlete_profile_id: athlete,
          });
          const templateId = randomUUID();
          const versionId = randomUUID();
          await client.db.insert(checkInTemplates).values({
            id: templateId,
            organization_id: organizationId,
            name: "Weekly",
            created_by_membership_id: ownerMembership,
          });
          await client.db.insert(checkInTemplateVersions).values({
            id: versionId,
            organization_id: organizationId,
            template_id: templateId,
            version_number: 1,
            name: "Weekly v1",
            questions,
            published_by_membership_id: ownerMembership,
          });
          const scheduleId = randomUUID();
          await client.db.insert(checkInSchedules).values({
            id: scheduleId,
            organization_id: organizationId,
            engagement_id: engagementId,
            athlete_profile_id: athlete,
            template_version_id: versionId,
            weekday: "monday",
            local_time: "09:00",
            time_zone: "UTC",
          });
          const occurrence = async (date: string) => {
            const id = randomUUID();
            await client.db.insert(checkInOccurrences).values({
              id,
              organization_id: organizationId,
              schedule_id: scheduleId,
              engagement_id: engagementId,
              athlete_profile_id: athlete,
              template_version_id: versionId,
              period_start_date: date,
              scheduled_local_time: "09:00",
              time_zone: "UTC",
            });
            return id;
          };
          const first = await occurrence("2026-11-02");
          const second = await occurrence("2026-11-09");
          await occurrence("2026-11-16");
          await occurrence("2026-11-23");
          const athleteApi = appRouter.createCaller(context(client.db, athlete)).athleteCheckIns;
          const strangerApi = appRouter.createCaller(context(client.db, stranger)).athleteCheckIns;
          const ownerApi = appRouter.createCaller(context(client.db, owner)).athleteCheckIns;
          const coachApi = appRouter.createCaller(context(client.db, coach)).athleteCheckIns;
          const administratorApi = appRouter.createCaller(
            context(client.db, administrator),
          ).athleteCheckIns;

          await expect(athleteApi.get({ occurrenceId: first })).resolves.toMatchObject({
            occurrenceId: first,
            state: "pending",
            canSubmit: true,
            submission: null,
            templateVersion: { versionId, questions },
          });
          await expect(athleteApi.list({ limit: 10, cursor: null })).resolves.toMatchObject({
            items: expect.arrayContaining([
              expect.objectContaining({ occurrenceId: first, state: "pending", submission: null }),
            ]),
          });
          await expect(strangerApi.get({ occurrenceId: randomUUID() })).rejects.toMatchObject({
            code: "NOT_FOUND",
          });
          for (const api of [ownerApi, coachApi, administratorApi, strangerApi]) {
            await expect(
              api.submit({
                occurrenceId: first,
                templateVersionId: versionId,
                expectedRevision: 0,
                idempotencyKey: randomUUID(),
                answers,
              }),
            ).rejects.toMatchObject({ code: "NOT_FOUND" });
          }
          await expect(
            strangerApi.submit({
              occurrenceId: randomUUID(),
              templateVersionId: versionId,
              expectedRevision: 0,
              idempotencyKey: randomUUID(),
              answers,
            }),
          ).rejects.toMatchObject({ code: "NOT_FOUND" });
          await expect(
            athleteApi.submit({
              occurrenceId: first,
              templateVersionId: versionId,
              expectedRevision: 0,
              idempotencyKey: randomUUID(),
              answers: [],
            }),
          ).rejects.toMatchObject({ code: "BAD_REQUEST" });
          await expect(
            athleteApi.submit({
              occurrenceId: first,
              templateVersionId: randomUUID(),
              expectedRevision: 0,
              idempotencyKey: randomUUID(),
              answers,
            }),
          ).rejects.toMatchObject({ code: "BAD_REQUEST" });
          await expect(
            athleteApi.submit({
              occurrenceId: first,
              templateVersionId: versionId,
              expectedRevision: 1,
              idempotencyKey: randomUUID(),
              answers,
            }),
          ).rejects.toMatchObject({ code: "CONFLICT" });
          await expect(
            athleteApi.submit({
              occurrenceId: first,
              templateVersionId: versionId,
              expectedRevision: 0,
              idempotencyKey: randomUUID(),
              answers,
              reviewedAt: new Date(),
            } as never),
          ).rejects.toMatchObject({ code: "BAD_REQUEST" });

          const key = randomUUID();
          const submitted = await athleteApi.submit({
            occurrenceId: first,
            templateVersionId: versionId,
            expectedRevision: 0,
            idempotencyKey: key,
            answers,
          });
          await expect(
            athleteApi.submit({
              occurrenceId: first,
              templateVersionId: versionId,
              expectedRevision: 0,
              idempotencyKey: key,
              answers,
            }),
          ).resolves.toEqual({ ...submitted, replayed: true });
          await expect(
            athleteApi.submit({
              occurrenceId: first,
              templateVersionId: versionId,
              expectedRevision: 0,
              idempotencyKey: key,
              answers: [{ questionId, kind: "scale_1_to_10", value: 8 }],
            }),
          ).rejects.toMatchObject({ code: "CONFLICT" });
          await expect(strangerApi.get({ occurrenceId: first })).rejects.toMatchObject({
            code: "NOT_FOUND",
          });
          await client.db
            .update(coachingEngagements)
            .set({ paused_at: new Date() })
            .where(eq(coachingEngagements.id, engagementId));
          await expect(
            athleteApi.submit({
              occurrenceId: second,
              templateVersionId: versionId,
              expectedRevision: 0,
              idempotencyKey: randomUUID(),
              answers,
            }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          await expect(athleteApi.get({ occurrenceId: second })).resolves.toMatchObject({
            occurrenceId: second,
            state: "pending",
            canSubmit: false,
            unavailableReason: "engagement_paused",
          });
          for (const input of [
            { expectedRevision: 0, answers: [] },
            { expectedRevision: 1, answers },
          ]) {
            await expect(
              athleteApi.submit({
                occurrenceId: second,
                templateVersionId: versionId,
                idempotencyKey: randomUUID(),
                ...input,
              }),
            ).rejects.toMatchObject({ code: "FORBIDDEN" });
          }
          await expect(
            athleteApi.submit({
              occurrenceId: first,
              templateVersionId: versionId,
              expectedRevision: 0,
              idempotencyKey: key,
              answers,
            }),
          ).resolves.toEqual({ ...submitted, replayed: true });
          await expect(
            athleteApi.submit({
              occurrenceId: first,
              templateVersionId: versionId,
              expectedRevision: 0,
              idempotencyKey: key,
              answers: [{ questionId, kind: "scale_1_to_10", value: 8 }],
            }),
          ).rejects.toMatchObject({ code: "CONFLICT" });
          await expect(athleteApi.get({ occurrenceId: first })).resolves.toMatchObject({
            occurrenceId: first,
            state: "submitted",
            submission: { submissionId: submitted.submissionId },
          });
          await client.db
            .update(coachingEngagements)
            .set({ paused_at: null, ended_at: new Date() })
            .where(eq(coachingEngagements.id, engagementId));
          await expect(
            athleteApi.submit({
              occurrenceId: second,
              templateVersionId: versionId,
              expectedRevision: 0,
              idempotencyKey: randomUUID(),
              answers,
            }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          await expect(athleteApi.get({ occurrenceId: second })).resolves.toMatchObject({
            occurrenceId: second,
            state: "pending",
            canSubmit: false,
            unavailableReason: "engagement_ended",
          });
          for (const input of [
            { expectedRevision: 0, answers: [] },
            { expectedRevision: 1, answers },
          ]) {
            await expect(
              athleteApi.submit({
                occurrenceId: second,
                templateVersionId: versionId,
                idempotencyKey: randomUUID(),
                ...input,
              }),
            ).rejects.toMatchObject({ code: "FORBIDDEN" });
          }
          await expect(
            athleteApi.submit({
              occurrenceId: first,
              templateVersionId: versionId,
              expectedRevision: 0,
              idempotencyKey: key,
              answers,
            }),
          ).resolves.toEqual({ ...submitted, replayed: true });
          await expect(athleteApi.list({ limit: 10, cursor: null })).resolves.toMatchObject({
            items: expect.arrayContaining([expect.objectContaining({ occurrenceId: first })]),
          });
          const activeEngagementId = randomUUID();
          const activeScheduleId = randomUUID();
          await client.db.insert(coachingEngagements).values({
            id: activeEngagementId,
            organization_id: organizationId,
            athlete_profile_id: athlete,
          });
          await client.db.insert(checkInSchedules).values({
            id: activeScheduleId,
            organization_id: organizationId,
            engagement_id: activeEngagementId,
            athlete_profile_id: athlete,
            template_version_id: versionId,
            weekday: "monday",
            local_time: "09:00",
            time_zone: "UTC",
          });
          const activeOccurrence = async (date: string) => {
            const id = randomUUID();
            await client.db.insert(checkInOccurrences).values({
              id,
              organization_id: organizationId,
              schedule_id: activeScheduleId,
              engagement_id: activeEngagementId,
              athlete_profile_id: athlete,
              template_version_id: versionId,
              period_start_date: date,
              scheduled_local_time: "09:00",
              time_zone: "UTC",
            });
            return id;
          };
          const activeSecond = await activeOccurrence("2026-11-30");
          const activeThird = await activeOccurrence("2026-12-07");
          const activeFourth = await activeOccurrence("2026-12-14");
          const activeFifth = await activeOccurrence("2026-12-21");

          const concurrent = await Promise.allSettled([
            athleteApi.submit({
              occurrenceId: activeSecond,
              templateVersionId: versionId,
              expectedRevision: 0,
              idempotencyKey: randomUUID(),
              answers,
            }),
            athleteApi.submit({
              occurrenceId: activeSecond,
              templateVersionId: versionId,
              expectedRevision: 0,
              idempotencyKey: randomUUID(),
              answers,
            }),
          ]);
          expect(concurrent.filter((result) => result.status === "fulfilled")).toHaveLength(1);
          expect(concurrent.find((result) => result.status === "rejected")).toMatchObject({
            reason: { code: "CONFLICT" },
          });
          const sharedKey = randomUUID();
          const keyRace = await Promise.allSettled([
            athleteApi.submit({
              occurrenceId: activeThird,
              templateVersionId: versionId,
              expectedRevision: 0,
              idempotencyKey: sharedKey,
              answers,
            }),
            athleteApi.submit({
              occurrenceId: activeFourth,
              templateVersionId: versionId,
              expectedRevision: 0,
              idempotencyKey: sharedKey,
              answers,
            }),
          ]);
          expect(keyRace.filter((result) => result.status === "fulfilled")).toHaveLength(1);
          expect(keyRace.find((result) => result.status === "rejected")).toMatchObject({
            reason: { code: "CONFLICT" },
          });
          const reviewedSubmission = (
            await client.db
              .select({ id: checkInSubmissions.id })
              .from(checkInSubmissions)
              .where(eq(checkInSubmissions.occurrence_id, activeSecond))
          )[0];
          if (!reviewedSubmission) throw new Error("concurrent submission fixture missing");
          await client.db
            .update(checkInSubmissions)
            .set({
              reviewed_at: new Date(),
              reviewed_by_membership_id: ownerMembership,
              reviewed_by_profile_id: owner,
            })
            .where(eq(checkInSubmissions.id, reviewedSubmission.id));
          await expect(athleteApi.get({ occurrenceId: activeSecond })).resolves.toMatchObject({
            occurrenceId: activeSecond,
            state: "reviewed",
            submission: { submissionId: reviewedSubmission.id },
            reviewedByProfileId: owner,
          });
          await expect(athleteApi.list({ limit: 20, cursor: null })).resolves.toMatchObject({
            items: expect.arrayContaining([
              expect.objectContaining({ occurrenceId: activeSecond, state: "reviewed" }),
            ]),
          });
          expect(
            await client.db
              .select()
              .from(checkInSubmissions)
              .where(eq(checkInSubmissions.athlete_profile_id, athlete)),
          ).toHaveLength(3);
          const firstPage = await athleteApi.list({ limit: 2, cursor: null });
          expect(firstPage.items).toHaveLength(2);
          expect(firstPage.nextCursor).not.toBeNull();
          if (!firstPage.nextCursor) throw new Error("pagination cursor fixture missing");
          const secondPage = await athleteApi.list({ limit: 2, cursor: firstPage.nextCursor });
          expect(secondPage.items).toHaveLength(2);
          expect(secondPage.items.map((item) => item.occurrenceId)).not.toEqual(
            expect.arrayContaining(firstPage.items.map((item) => item.occurrenceId)),
          );
          await client.db
            .update(organizations)
            .set({ suspended_at: new Date() })
            .where(eq(organizations.id, organizationId));
          await expect(athleteApi.get({ occurrenceId: activeFifth })).resolves.toMatchObject({
            occurrenceId: activeFifth,
            state: "pending",
            canSubmit: false,
            unavailableReason: "organization_inactive",
          });
          await expect(
            athleteApi.submit({
              occurrenceId: activeFifth,
              templateVersionId: versionId,
              expectedRevision: 0,
              idempotencyKey: randomUUID(),
              answers,
            }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          for (const input of [
            { expectedRevision: 0, answers: [] },
            { expectedRevision: 1, answers },
          ]) {
            await expect(
              athleteApi.submit({
                occurrenceId: activeFifth,
                templateVersionId: versionId,
                idempotencyKey: randomUUID(),
                ...input,
              }),
            ).rejects.toMatchObject({ code: "FORBIDDEN" });
          }
          await expect(
            athleteApi.submit({
              occurrenceId: first,
              templateVersionId: versionId,
              expectedRevision: 0,
              idempotencyKey: key,
              answers,
            }),
          ).resolves.toEqual({ ...submitted, replayed: true });
          await expect(
            athleteApi.submit({
              occurrenceId: first,
              templateVersionId: versionId,
              expectedRevision: 0,
              idempotencyKey: key,
              answers: [{ questionId, kind: "scale_1_to_10", value: 8 }],
            }),
          ).rejects.toMatchObject({ code: "CONFLICT" });
          await client.db
            .update(organizations)
            .set({ suspended_at: null, closed_at: new Date() })
            .where(eq(organizations.id, organizationId));
          await expect(athleteApi.get({ occurrenceId: activeFifth })).resolves.toMatchObject({
            occurrenceId: activeFifth,
            state: "pending",
            canSubmit: false,
            unavailableReason: "organization_inactive",
          });
          for (const input of [
            { expectedRevision: 0, answers: [] },
            { expectedRevision: 1, answers },
          ]) {
            await expect(
              athleteApi.submit({
                occurrenceId: activeFifth,
                templateVersionId: versionId,
                idempotencyKey: randomUUID(),
                ...input,
              }),
            ).rejects.toMatchObject({ code: "FORBIDDEN" });
          }
          await expect(
            athleteApi.submit({
              occurrenceId: first,
              templateVersionId: versionId,
              expectedRevision: 0,
              idempotencyKey: key,
              answers,
            }),
          ).resolves.toEqual({ ...submitted, replayed: true });
        } finally {
          await client.close();
        }
      },
    );
  });
});
