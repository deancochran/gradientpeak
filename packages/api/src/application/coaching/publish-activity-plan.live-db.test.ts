import { randomUUID } from "node:crypto";
import { activityPlanSemanticHash, activityPlanStructureSchema } from "@repo/core/activity-plan";
import { createDbClient, type DrizzleDbClient } from "@repo/db/client";
import {
  activityPlans,
  athletePlanEditGrants,
  coachingActivityPlanPublications,
  coachingAssignments,
  coachingEngagements,
  organizationMembershipRoleGrants,
  organizationMemberships,
  plannedSessions,
  profiles,
  users,
} from "@repo/db/schema";
import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  requireFreshBaseline,
  withDisposableDatabase,
} from "@repo/db/testing/disposable-database";
import { and, eq, sql } from "drizzle-orm";
import { expect, it } from "vitest";
import { withProfileFencedRepeatableReadSnapshot } from "../../db";
import { coachingPublicationRouter } from "../../routers/coaching-publication";
import { organizationsRouter } from "../../routers/organizations";
import { activityPlanStructureHash } from "../activity-plans/structure-hash";
import { publishCoachActivityPlan } from "./publish-activity-plan";

const structure = activityPlanStructureSchema.parse({
  version: 5,
  activity_category: "bike",
  items: [
    {
      type: "step",
      id: "fdbdfb92-853b-4a47-ae67-7a237637390f",
      name: "Endurance",
      duration: { type: "time", seconds: 1800 },
      targets: [{ type: "%FTP", intensity: 70 }],
    },
  ],
});
const structureHash = activityPlanStructureHash(structure);
const semanticHash = activityPlanSemanticHash({
  structure,
  trainingIntent: "general_maintenance",
});
const revisedStructure = activityPlanStructureSchema.parse({
  ...structure,
  items: [{ ...structure.items[0], name: "Endurance Plus" }],
});
const revisedStructureHash = activityPlanStructureHash(revisedStructure);
const revisedSemanticHash = activityPlanSemanticHash({
  structure: revisedStructure,
  trainingIntent: "aerobic_base",
});
const planningDate = "2099-01-01";
const now = new Date("2098-12-01T12:00:00.000Z");

function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function context(db: DrizzleDbClient, id: string) {
  return {
    auth: { lookupInput: { clientType: "web", headers: new Headers() }, session: null },
    authSession: null,
    clientType: "web",
    db,
    headers: new Headers(),
    session: { user: { id, email: `${id}@coaching-publication.test` } },
    trpcSource: "vitest-live-db",
  } as never;
}

async function person(db: DrizzleDbClient, name: string, timezone = "UTC") {
  const id = randomUUID();
  const email = `${id}@coaching-publication.test`;
  await db.insert(users).values({ id, name, email, emailVerified: true });
  await db.insert(profiles).values({
    id,
    email,
    full_name: name,
    username: `publication-${id.slice(0, 8)}`,
    onboarding_status: "completed",
    planning_timezone: timezone,
    is_public: false,
  });
  return id;
}

async function organizationWithCoach(input: {
  db: DrizzleDbClient;
  ownerId: string;
  coachId: string;
  athleteId: string;
}) {
  const organizationId = randomUUID();
  await organizationsRouter.createCaller(context(input.db, input.ownerId)).create({
    organizationId,
    name: `Publication ${organizationId}`,
    slug: `publication-${organizationId}`,
    timezone: "UTC",
  });
  const coachMembershipId = randomUUID();
  await input.db.insert(organizationMemberships).values({
    id: coachMembershipId,
    organization_id: organizationId,
    profile_id: input.coachId,
  });
  await input.db.insert(organizationMembershipRoleGrants).values({
    id: randomUUID(),
    organization_id: organizationId,
    membership_id: coachMembershipId,
    role_key: "coach",
  });
  const engagementId = randomUUID();
  await input.db.insert(coachingEngagements).values({
    id: engagementId,
    organization_id: organizationId,
    athlete_profile_id: input.athleteId,
  });
  await input.db.insert(coachingAssignments).values({
    id: randomUUID(),
    organization_id: organizationId,
    engagement_id: engagementId,
    coach_membership_id: coachMembershipId,
    assignment_kind: "primary",
  });
  return { coachMembershipId, engagementId, organizationId };
}

async function sourcePlan(db: DrizzleDbClient, coachId: string) {
  const id = randomUUID();
  await db.insert(activityPlans).values({
    id,
    profile_id: coachId,
    name: "Coach endurance activity plan",
    structure,
    structure_hash: structureHash,
    semantic_hash: semanticHash,
  });
  return id;
}

it("enforces athlete publication authority, idempotency, input validation, engagement isolation, and rollback on fresh PostgreSQL", async () => {
  await withDisposableDatabase(
    ["--disposable", "--local"],
    "coaching_publication",
    async (pool, url) => {
      await bootstrapSupabaseSchemas(pool);
      for (const migrationPath of requireFreshBaseline().migrationPaths) {
        await applySqlFile(pool, migrationPath);
      }
      const client = createDbClient({ url });
      const publishingClient = createDbClient({ url });
      const revokingClient = createDbClient({ url });
      try {
        const db = client.db;
        const ownerId = await person(db, "Organization owner");
        const coachId = await person(db, "Coach");
        const athleteId = await person(db, "Athlete");
        const outsiderId = await person(db, "Outsider");
        const sourceActivityPlanId = await sourcePlan(db, coachId);
        const first = await organizationWithCoach({ db, ownerId, coachId, athleteId });
        const second = await organizationWithCoach({ db, ownerId, coachId, athleteId });
        const athleteCaller = coachingPublicationRouter.createCaller(context(db, athleteId));
        const coachCaller = coachingPublicationRouter.createCaller(context(db, coachId));
        const outsiderCaller = coachingPublicationRouter.createCaller(context(db, outsiderId));
        const operationId = `publication_${"a".repeat(32)}`;
        const publish = {
          organizationId: first.organizationId,
          athleteProfileId: athleteId,
          coachMembershipId: first.coachMembershipId,
          activityPlanId: sourceActivityPlanId,
          activityPlanRevision: 1,
          planningDate,
          operationId,
        };

        expect(await outsiderCaller.permissionOptions()).toEqual({ options: [] });
        const initialPermissionOptions = await athleteCaller.permissionOptions();
        expect(initialPermissionOptions.options).toHaveLength(2);
        expect(initialPermissionOptions).toEqual({
          options: expect.arrayContaining([
            {
              organization: {
                id: first.organizationId,
                name: `Publication ${first.organizationId}`,
              },
              coach: { membershipId: first.coachMembershipId, name: "Coach" },
              currentGrant: null,
            },
            {
              organization: {
                id: second.organizationId,
                name: `Publication ${second.organizationId}`,
              },
              coach: { membershipId: second.coachMembershipId, name: "Coach" },
              currentGrant: null,
            },
          ]),
        });

        await expect(coachCaller.publish(publish)).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect(
          await db
            .select({ count: sql<number>`count(*)::int` })
            .from(activityPlans)
            .where(eq(activityPlans.profile_id, athleteId)),
        ).toEqual([{ count: 0 }]);

        const granted = await athleteCaller.grant({
          organizationId: first.organizationId,
          coachMembershipId: first.coachMembershipId,
        });
        if (!granted.grant) throw new Error("Expected athlete permission grant");
        const grantedPermissionOptions = await athleteCaller.permissionOptions();
        expect(grantedPermissionOptions.options).toHaveLength(2);
        expect(grantedPermissionOptions).toEqual({
          options: expect.arrayContaining([
            {
              organization: {
                id: first.organizationId,
                name: `Publication ${first.organizationId}`,
              },
              coach: { membershipId: first.coachMembershipId, name: "Coach" },
              currentGrant: { id: granted.grant.id },
            },
            {
              organization: {
                id: second.organizationId,
                name: `Publication ${second.organizationId}`,
              },
              coach: { membershipId: second.coachMembershipId, name: "Coach" },
              currentGrant: null,
            },
          ]),
        });
        expect(
          await athleteCaller.grant({
            organizationId: first.organizationId,
            coachMembershipId: first.coachMembershipId,
          }),
        ).toEqual(granted);

        await expect(
          coachCaller.publish({
            ...publish,
            activityPlanRevision: 0,
            operationId: `publication_${"b".repeat(32)}`,
          }),
        ).rejects.toMatchObject({ code: "BAD_REQUEST" });
        await expect(
          coachCaller.publish({
            ...publish,
            planningDate: "2099-02-30",
            operationId: `publication_${"c".repeat(32)}`,
          }),
        ).rejects.toMatchObject({ code: "BAD_REQUEST" });
        await expect(
          coachCaller.publish({
            ...publish,
            activityPlanRevision: 2,
            operationId: `publication_${"d".repeat(32)}`,
          }),
        ).rejects.toMatchObject({ code: "CONFLICT" });
        await expect(
          coachCaller.publish({
            ...publish,
            organizationId: second.organizationId,
            coachMembershipId: second.coachMembershipId,
            operationId: `publication_${"e".repeat(32)}`,
          }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });

        const created = await coachCaller.publish(publish);
        expect(created.status).toBe("created");
        const [copiedBeforeSourceEdit] = await db
          .select({
            name: activityPlans.name,
            revision: activityPlans.revision,
            structure: activityPlans.structure,
            trainingIntent: activityPlans.training_intent,
          })
          .from(activityPlans)
          .where(eq(activityPlans.id, created.copiedActivityPlanId));
        const [sessionBeforeSourceEdit] = await db
          .select({
            activityPlanId: plannedSessions.activity_plan_id,
            activityPlanRevision: plannedSessions.activity_plan_revision,
            resolutionManifest: plannedSessions.resolution_manifest,
          })
          .from(plannedSessions)
          .where(eq(plannedSessions.id, created.session.id));
        expect(copiedBeforeSourceEdit).toBeTruthy();
        expect(sessionBeforeSourceEdit).toBeTruthy();
        await db
          .update(activityPlans)
          .set({
            name: "Coach revised activity plan",
            semantic_hash: revisedSemanticHash,
            structure: revisedStructure,
            structure_hash: revisedStructureHash,
            training_intent: "aerobic_base",
          })
          .where(eq(activityPlans.id, sourceActivityPlanId));
        expect(
          await db
            .select({ revision: activityPlans.revision })
            .from(activityPlans)
            .where(eq(activityPlans.id, sourceActivityPlanId)),
        ).toEqual([{ revision: 2 }]);
        const repeated = await coachCaller.publish(publish);
        expect(repeated).toEqual({
          status: "existing",
          session: { id: created.session.id },
          copiedActivityPlanId: created.copiedActivityPlanId,
        });
        await expect(
          withProfileFencedRepeatableReadSnapshot(db, athleteId, (tx) =>
            publishCoachActivityPlan({
              tx,
              actorProfileId: coachId,
              organizationId: first.organizationId,
              athleteProfileId: athleteId,
              coachMembershipId: first.coachMembershipId,
              activityPlanId: sourceActivityPlanId,
              activityPlanRevision: 1,
              planningDate,
              operationId,
              now: new Date("2099-01-02T12:00:00.000Z"),
            }),
          ),
        ).resolves.toEqual({
          status: "existing",
          session: { id: created.session.id },
          copiedActivityPlanId: created.copiedActivityPlanId,
        });
        await expect(
          withProfileFencedRepeatableReadSnapshot(db, athleteId, (tx) =>
            publishCoachActivityPlan({
              tx,
              actorProfileId: coachId,
              organizationId: first.organizationId,
              athleteProfileId: athleteId,
              coachMembershipId: first.coachMembershipId,
              activityPlanId: sourceActivityPlanId,
              activityPlanRevision: 2,
              planningDate,
              operationId: `publication_${"m".repeat(32)}`,
              now: new Date("2099-01-02T12:00:00.000Z"),
            }),
          ),
        ).rejects.toThrow("only future athlete-local sessions");
        await expect(
          coachCaller.publish({ ...publish, activityPlanRevision: 2 }),
        ).rejects.toMatchObject({ code: "CONFLICT" });
        expect(
          await db
            .select({
              name: activityPlans.name,
              revision: activityPlans.revision,
              structure: activityPlans.structure,
              trainingIntent: activityPlans.training_intent,
            })
            .from(activityPlans)
            .where(eq(activityPlans.id, created.copiedActivityPlanId)),
        ).toEqual([copiedBeforeSourceEdit]);
        expect(
          await db
            .select({
              activityPlanId: plannedSessions.activity_plan_id,
              activityPlanRevision: plannedSessions.activity_plan_revision,
              resolutionManifest: plannedSessions.resolution_manifest,
            })
            .from(plannedSessions)
            .where(eq(plannedSessions.id, created.session.id)),
        ).toEqual([sessionBeforeSourceEdit]);
        await expect(
          coachCaller.publish({ ...publish, planningDate: "2099-01-02" }),
        ).rejects.toMatchObject({ code: "CONFLICT" });

        await expect(
          db
            .update(coachingActivityPlanPublications)
            .set({ planned_session_id: randomUUID() })
            .where(eq(coachingActivityPlanPublications.planned_session_id, created.session.id)),
        ).rejects.toThrow();
        await expect(
          db
            .update(coachingActivityPlanPublications)
            .set({ athlete_profile_id: outsiderId })
            .where(eq(coachingActivityPlanPublications.planned_session_id, created.session.id)),
        ).rejects.toThrow();
        await expect(
          db.delete(plannedSessions).where(eq(plannedSessions.id, created.session.id)),
        ).rejects.toThrow();

        const beforeRollbackCopies = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(activityPlans)
          .where(eq(activityPlans.profile_id, athleteId));
        const rollbackOperationId = `publication_${"f".repeat(32)}`;
        await expect(
          withProfileFencedRepeatableReadSnapshot(db, athleteId, async (tx) => {
            await publishCoachActivityPlan({
              tx,
              actorProfileId: coachId,
              organizationId: first.organizationId,
              athleteProfileId: athleteId,
              coachMembershipId: first.coachMembershipId,
              activityPlanId: sourceActivityPlanId,
              activityPlanRevision: 2,
              planningDate,
              operationId: rollbackOperationId,
              now,
            });
            throw new Error("force transaction rollback after publication");
          }),
        ).rejects.toThrow("force transaction rollback after publication");
        expect(
          await db
            .select({ count: sql<number>`count(*)::int` })
            .from(activityPlans)
            .where(eq(activityPlans.profile_id, athleteId)),
        ).toEqual(beforeRollbackCopies);
        expect(
          await db
            .select({ id: coachingActivityPlanPublications.id })
            .from(coachingActivityPlanPublications)
            .where(
              and(
                eq(coachingActivityPlanPublications.athlete_profile_id, athleteId),
                eq(coachingActivityPlanPublications.operation_id, rollbackOperationId),
              ),
            ),
        ).toEqual([]);

        await db
          .update(profiles)
          .set({ planning_timezone: "Pacific/Kiritimati" })
          .where(eq(profiles.id, athleteId));
        await expect(
          withProfileFencedRepeatableReadSnapshot(db, athleteId, (tx) =>
            publishCoachActivityPlan({
              tx,
              actorProfileId: coachId,
              organizationId: first.organizationId,
              athleteProfileId: athleteId,
              coachMembershipId: first.coachMembershipId,
              activityPlanId: sourceActivityPlanId,
              activityPlanRevision: 2,
              planningDate: "2098-12-01",
              operationId: `publication_${"i".repeat(32)}`,
              now,
            }),
          ),
        ).rejects.toThrow("only future athlete-local sessions");
        await expect(
          withProfileFencedRepeatableReadSnapshot(db, athleteId, (tx) =>
            publishCoachActivityPlan({
              tx,
              actorProfileId: coachId,
              organizationId: first.organizationId,
              athleteProfileId: athleteId,
              coachMembershipId: first.coachMembershipId,
              activityPlanId: sourceActivityPlanId,
              activityPlanRevision: 2,
              planningDate: "2098-12-02",
              operationId: `publication_${"j".repeat(32)}`,
              now,
            }),
          ),
        ).resolves.toMatchObject({ status: "created" });

        const artifactCounts = async () => {
          const [copies] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(activityPlans)
            .where(eq(activityPlans.profile_id, athleteId));
          const [receipts] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(coachingActivityPlanPublications)
            .where(eq(coachingActivityPlanPublications.athlete_profile_id, athleteId));
          const [sessions] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(plannedSessions)
            .where(eq(plannedSessions.profile_id, athleteId));
          if (!copies || !receipts || !sessions)
            throw new Error("Expected publication artifact counts");
          return { copies: copies.count, receipts: receipts.count, sessions: sessions.count };
        };

        expect(await artifactCounts()).toEqual({ copies: 2, receipts: 2, sessions: 2 });

        const publishFenceEntered = deferred();
        const releasePublishFence = deferred();
        const publishFirst = withProfileFencedRepeatableReadSnapshot(
          publishingClient.db,
          athleteId,
          async (tx) => {
            publishFenceEntered.resolve();
            await releasePublishFence.promise;
            return publishCoachActivityPlan({
              tx,
              actorProfileId: coachId,
              organizationId: first.organizationId,
              athleteProfileId: athleteId,
              coachMembershipId: first.coachMembershipId,
              activityPlanId: sourceActivityPlanId,
              activityPlanRevision: 2,
              planningDate,
              operationId: `publication_${"k".repeat(32)}`,
              now,
            });
          },
        );
        await publishFenceEntered.promise;
        let revokeSettled = false;
        const revokeAfterPublish = coachingPublicationRouter
          .createCaller(context(revokingClient.db, athleteId))
          .revoke({ grantId: granted.grant.id })
          .finally(() => {
            revokeSettled = true;
          });
        await Promise.resolve();
        expect(revokeSettled).toBe(false);
        releasePublishFence.resolve();
        await expect(publishFirst).resolves.toMatchObject({ status: "created" });
        await expect(revokeAfterPublish).resolves.toEqual({
          revoked: true,
          grantId: granted.grant.id,
        });
        expect(await artifactCounts()).toEqual({ copies: 3, receipts: 3, sessions: 3 });

        const regranted = await athleteCaller.grant({
          organizationId: first.organizationId,
          coachMembershipId: first.coachMembershipId,
        });
        if (!regranted.grant) throw new Error("Expected restored athlete permission grant");
        const restoredGrantId = regranted.grant.id;
        const revokeFenceEntered = deferred();
        const releaseRevokeFence = deferred();
        const revokeFirst = withProfileFencedRepeatableReadSnapshot(
          revokingClient.db,
          athleteId,
          async (tx) => {
            revokeFenceEntered.resolve();
            await releaseRevokeFence.promise;
            await tx
              .update(athletePlanEditGrants)
              .set({ revoked_at: now })
              .where(eq(athletePlanEditGrants.id, restoredGrantId));
          },
        );
        await revokeFenceEntered.promise;
        let publishStartedAfterRevoke = false;
        const publishAfterRevoke = withProfileFencedRepeatableReadSnapshot(
          publishingClient.db,
          athleteId,
          async (tx) => {
            publishStartedAfterRevoke = true;
            return publishCoachActivityPlan({
              tx,
              actorProfileId: coachId,
              organizationId: first.organizationId,
              athleteProfileId: athleteId,
              coachMembershipId: first.coachMembershipId,
              activityPlanId: sourceActivityPlanId,
              activityPlanRevision: 2,
              planningDate,
              operationId: `publication_${"l".repeat(32)}`,
              now,
            });
          },
        );
        await Promise.resolve();
        expect(publishStartedAfterRevoke).toBe(false);
        releaseRevokeFence.resolve();
        await revokeFirst;
        await expect(publishAfterRevoke).rejects.toThrow("permission is unavailable");
        expect(await artifactCounts()).toEqual({ copies: 3, receipts: 3, sessions: 3 });

        await db
          .update(coachingAssignments)
          .set({ ended_at: now })
          .where(eq(coachingAssignments.engagement_id, second.engagementId));
        expect(await athleteCaller.permissionOptions()).toEqual({
          options: [
            {
              organization: {
                id: first.organizationId,
                name: `Publication ${first.organizationId}`,
              },
              coach: { membershipId: first.coachMembershipId, name: "Coach" },
              currentGrant: null,
            },
          ],
        });
        await expect(
          coachCaller.publish({ ...publish, operationId: `publication_${"g".repeat(32)}` }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });

        await db
          .update(profiles)
          .set({ planning_timezone: "not/a-real-time-zone" })
          .where(eq(profiles.id, athleteId));
        await expect(
          db.transaction((tx) =>
            publishCoachActivityPlan({
              tx,
              actorProfileId: coachId,
              organizationId: first.organizationId,
              athleteProfileId: athleteId,
              coachMembershipId: first.coachMembershipId,
              activityPlanId: sourceActivityPlanId,
              activityPlanRevision: 2,
              planningDate,
              operationId: `publication_${"h".repeat(32)}`,
              now,
            }),
          ),
        ).rejects.toThrow("valid athlete-local planning date");

        expect(await artifactCounts()).toEqual({ copies: 3, receipts: 3, sessions: 3 });
        expect(
          await db.select({ id: athletePlanEditGrants.id }).from(athletePlanEditGrants),
        ).toHaveLength(2);
      } finally {
        await revokingClient.close();
        await publishingClient.close();
        await client.close();
      }
    },
  );
});
