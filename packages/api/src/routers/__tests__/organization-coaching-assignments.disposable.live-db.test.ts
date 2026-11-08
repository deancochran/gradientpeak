import { createHash, randomUUID } from "node:crypto";
import { createDbClient, type DrizzleDbClient } from "@repo/db/client";
import {
  athleteDataSharingConsents,
  coachingAssignments,
  coachingEngagements,
  organizationAuditEvents,
  organizationMembershipRoleGrants,
  organizationMemberships,
  profiles,
  users,
} from "@repo/db/schema";
import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  requireFreshBaseline,
  withDisposableDatabase,
} from "@repo/db/testing/disposable-database";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { organizationsRouter } from "../organizations";

function context(db: DrizzleDbClient, userId: string) {
  return {
    auth: { lookupInput: { clientType: "web", headers: new Headers() }, session: null },
    authSession: null,
    clientType: "web",
    db,
    headers: new Headers(),
    session: { user: { id: userId, email: "disposable@example.test" } },
    trpcSource: "vitest-live-db",
  } as never;
}
async function person(db: DrizzleDbClient, label: string) {
  const id = randomUUID();
  await db
    .insert(users)
    .values({ id, name: label, email: `${id}@assignment.test`, emailVerified: true });
  await db.insert(profiles).values({
    id,
    email: `${id}@assignment.test`,
    full_name: label,
    username: `${label}-${id.slice(0, 8)}`,
    onboarding_status: "completed",
    is_public: false,
  });
  return id;
}
async function staff(
  db: DrizzleDbClient,
  organizationId: string,
  profileId: string,
  role: "admin" | "coach",
) {
  const id = randomUUID();
  await db
    .insert(organizationMemberships)
    .values({ id, organization_id: organizationId, profile_id: profileId });
  await db
    .insert(organizationMembershipRoleGrants)
    .values({ organization_id: organizationId, membership_id: id, role_key: role });
  return id;
}
const digest = (ids: readonly string[]) =>
  createHash("sha256")
    .update([...ids].sort().join(","))
    .digest("hex");

describe("organization direct coaching assignments against a fresh disposable PostgreSQL database", () => {
  it("proves direct-assignment authority, replay, stale/concurrent replacement, history, and receipt rollback", async () => {
    await withDisposableDatabase(
      ["--disposable", "--local"],
      "organization_coaching_assignments",
      async (pool, url) => {
        await bootstrapSupabaseSchemas(pool);
        for (const migration of requireFreshBaseline().migrationPaths)
          await applySqlFile(pool, migration);
        const client = createDbClient({ url });
        try {
          const owner = await person(client.db, "owner");
          const athlete = await person(client.db, "athlete");
          const pausedAthlete = await person(client.db, "paused-athlete");
          const rollbackAthlete = await person(client.db, "rollback-athlete");
          const first = await person(client.db, "first");
          const second = await person(client.db, "second");
          const third = await person(client.db, "third");
          const fourth = await person(client.db, "fourth");
          const inactive = await person(client.db, "inactive");
          const administrator = await person(client.db, "administrator");
          const organizationId = randomUUID();
          const ownerCaller = organizationsRouter.createCaller(context(client.db, owner));
          const created = await ownerCaller.create({
            organizationId,
            name: "Assignments",
            slug: `assignments-${organizationId}`,
            timezone: "UTC",
          });
          const firstMembershipId = await staff(client.db, organizationId, first, "coach");
          const secondMembershipId = await staff(client.db, organizationId, second, "coach");
          const thirdMembershipId = await staff(client.db, organizationId, third, "coach");
          const fourthMembershipId = await staff(client.db, organizationId, fourth, "coach");
          const inactiveMembershipId = await staff(client.db, organizationId, inactive, "coach");
          const administratorMembershipId = await staff(
            client.db,
            organizationId,
            administrator,
            "admin",
          );
          const engagementId = randomUUID();
          await client.db.insert(coachingEngagements).values({
            id: engagementId,
            organization_id: organizationId,
            athlete_profile_id: athlete,
          });
          const caller = ownerCaller.coachingAssignments;
          const coachCaller = organizationsRouter.createCaller(
            context(client.db, first),
          ).coachingAssignments;
          const athleteCaller = organizationsRouter.createCaller(
            context(client.db, athlete),
          ).coachingAssignments;
          const adminCaller = organizationsRouter.createCaller(
            context(client.db, administrator),
          ).coachingAssignments;
          await expect(coachCaller.list({ organizationId, engagementId })).rejects.toMatchObject({
            code: "FORBIDDEN",
          });
          await expect(
            athleteCaller.assign({
              organizationId,
              engagementId,
              operationId: randomUUID(),
              expectedStateDigest: digest([]),
              coachMembershipId: firstMembershipId,
              assignmentKind: "primary",
            }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          const operationId = randomUUID();
          await caller.assign({
            organizationId,
            engagementId,
            operationId,
            expectedStateDigest: digest([]),
            coachMembershipId: firstMembershipId,
            assignmentKind: "primary",
          });
          await expect(
            caller.assign({
              organizationId,
              engagementId,
              operationId,
              expectedStateDigest: digest([]),
              coachMembershipId: firstMembershipId,
              assignmentKind: "primary",
            }),
          ).resolves.toMatchObject({ status: "assigned" });
          await expect(
            caller.assign({
              organizationId,
              engagementId,
              operationId,
              expectedStateDigest: digest([]),
              coachMembershipId: secondMembershipId,
              assignmentKind: "primary",
            }),
          ).rejects.toMatchObject({ code: "CONFLICT" });
          const initial = await caller.list({ organizationId, engagementId });
          expect(initial.items).toHaveLength(1);
          expect(initial.stateDigest).toBe(digest(initial.items.map((row) => row.assignmentId)));
          const supportingOperationId = randomUUID();
          await caller.assign({
            organizationId,
            engagementId,
            operationId: supportingOperationId,
            expectedStateDigest: digest(initial.items.map((row) => row.assignmentId)),
            coachMembershipId: fourthMembershipId,
            assignmentKind: "supporting",
          });
          const before = await caller.list({ organizationId, engagementId });
          expect(before.stateDigest).toBe(digest(before.items.map((row) => row.assignmentId)));
          expect(before.items.map((row) => row.assignmentKind).sort()).toEqual([
            "primary",
            "supporting",
          ]);
          expect(
            await client.db
              .select({ id: athleteDataSharingConsents.id })
              .from(athleteDataSharingConsents)
              .where(eq(athleteDataSharingConsents.engagement_id, engagementId)),
          ).toEqual([]);
          const concurrentOperationIds = [randomUUID(), randomUUID()] as const;
          const concurrent = await Promise.allSettled([
            caller.assign({
              organizationId,
              engagementId,
              operationId: concurrentOperationIds[0],
              expectedStateDigest: digest(before.items.map((row) => row.assignmentId)),
              coachMembershipId: secondMembershipId,
              assignmentKind: "primary",
            }),
            caller.assign({
              organizationId,
              engagementId,
              operationId: concurrentOperationIds[1],
              expectedStateDigest: digest(before.items.map((row) => row.assignmentId)),
              coachMembershipId: thirdMembershipId,
              assignmentKind: "primary",
            }),
          ]);
          expect(concurrent.filter((result) => result.status === "fulfilled")).toHaveLength(1);
          const rejected = concurrent.find((result) => result.status === "rejected");
          expect(rejected).toMatchObject({ reason: { code: "CONFLICT" } });
          const current = await client.db
            .select()
            .from(coachingAssignments)
            .where(
              and(
                eq(coachingAssignments.engagement_id, engagementId),
                isNull(coachingAssignments.ended_at),
              ),
            );
          const currentPrimary = current.filter((row) => row.assignment_kind === "primary");
          expect(currentPrimary).toHaveLength(1);
          expect([secondMembershipId, thirdMembershipId]).toContain(
            currentPrimary[0]?.coach_membership_id,
          );
          expect(current.filter((row) => row.assignment_kind === "supporting")).toHaveLength(1);
          expect(
            await client.db
              .select({ id: coachingAssignments.id, endedAt: coachingAssignments.ended_at })
              .from(coachingAssignments)
              .where(eq(coachingAssignments.engagement_id, engagementId)),
          ).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                id: initial.items[0]?.assignmentId,
                endedAt: expect.any(Date),
              }),
            ]),
          );
          expect(
            await client.db
              .select({ correlationId: organizationAuditEvents.correlation_id })
              .from(organizationAuditEvents)
              .where(
                and(
                  eq(organizationAuditEvents.organization_id, organizationId),
                  inArray(organizationAuditEvents.correlation_id, concurrentOperationIds),
                ),
              ),
          ).toHaveLength(1);
          await expect(
            caller.assign({
              organizationId,
              engagementId,
              operationId: randomUUID(),
              expectedStateDigest: digest(before.items.map((row) => row.assignmentId)),
              coachMembershipId: secondMembershipId,
              assignmentKind: "primary",
            }),
          ).rejects.toMatchObject({ code: "CONFLICT" });
          const active = await caller.list({ organizationId, engagementId });
          const directoryBoundaryCoaches: { membershipId: string; label: string }[] = [];
          // Membership triggers serialize on the organization row; deliberately avoid concurrent
          // fixture creation so this boundary check does not manufacture a database deadlock.
          for (let index = 0; index < 51; index += 1) {
            const label = `directory-boundary-${index}`;
            const profileId = await person(client.db, label);
            directoryBoundaryCoaches.push({
              membershipId: await staff(client.db, organizationId, profileId, "coach"),
              label,
            });
          }
          const firstStaffPage = await ownerCaller.lifecycle.staff.list({
            organizationId,
            status: "active",
            limit: 50,
            cursor: null,
          });
          const beyondFirstStaffPage = directoryBoundaryCoaches.find(
            (candidate) =>
              !firstStaffPage.items.some(
                (member) => member.membershipId === candidate.membershipId,
              ),
          );
          expect(beyondFirstStaffPage).toBeDefined();
          if (!beyondFirstStaffPage)
            throw new Error("expected an active coach beyond staff page one");
          await caller.assign({
            organizationId,
            engagementId,
            operationId: randomUUID(),
            expectedStateDigest: digest(active.items.map((row) => row.assignmentId)),
            coachMembershipId: beyondFirstStaffPage.membershipId,
            assignmentKind: "supporting",
          });
          const activeWithBoundaryCoach = await caller.list({ organizationId, engagementId });
          expect(activeWithBoundaryCoach.items).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                coachMembershipId: beyondFirstStaffPage.membershipId,
                coachIdentity: expect.objectContaining({
                  displayName: beyondFirstStaffPage.label,
                  membershipStatus: "active",
                }),
              }),
            ]),
          );
          const supporting = activeWithBoundaryCoach.items.find(
            (row) => row.assignmentKind === "supporting",
          );
          expect(supporting).toBeDefined();
          if (!supporting) throw new Error("expected an active supporting assignment");
          const changeOperationId = randomUUID();
          await adminCaller.change({
            organizationId,
            engagementId,
            operationId: changeOperationId,
            expectedStateDigest: digest(
              activeWithBoundaryCoach.items.map((row) => row.assignmentId),
            ),
            assignmentId: supporting.assignmentId,
            coachMembershipId: firstMembershipId,
            assignmentKind: "supporting",
          });
          await expect(
            adminCaller.change({
              organizationId,
              engagementId,
              operationId: changeOperationId,
              expectedStateDigest: digest(
                activeWithBoundaryCoach.items.map((row) => row.assignmentId),
              ),
              assignmentId: supporting.assignmentId,
              coachMembershipId: firstMembershipId,
              assignmentKind: "supporting",
            }),
          ).resolves.toMatchObject({ status: "assigned" });
          const changed = await caller.list({ organizationId, engagementId });
          const changedSupporting = changed.items.find(
            (row) => row.assignmentKind === "supporting",
          );
          expect(changedSupporting).toBeDefined();
          if (!changedSupporting) throw new Error("expected replacement supporting assignment");
          const endOperationId = randomUUID();
          await caller.end({
            organizationId,
            engagementId,
            operationId: endOperationId,
            expectedStateDigest: digest(changed.items.map((row) => row.assignmentId)),
            assignmentId: changedSupporting.assignmentId,
          });
          await expect(
            caller.end({
              organizationId,
              engagementId,
              operationId: endOperationId,
              expectedStateDigest: digest(changed.items.map((row) => row.assignmentId)),
              assignmentId: changedSupporting.assignmentId,
            }),
          ).resolves.toMatchObject({ status: "ended" });
          await expect(
            caller.end({
              organizationId,
              engagementId,
              operationId: endOperationId,
              expectedStateDigest: digest(changed.items.map((row) => row.assignmentId)),
              assignmentId: currentPrimary[0]?.id ?? randomUUID(),
            }),
          ).rejects.toMatchObject({ code: "CONFLICT" });
          await client.db
            .update(organizationMembershipRoleGrants)
            .set({ revoked_at: new Date() })
            .where(eq(organizationMembershipRoleGrants.membership_id, administratorMembershipId));
          await expect(
            adminCaller.change({
              organizationId,
              engagementId,
              operationId: changeOperationId,
              expectedStateDigest: digest(active.items.map((row) => row.assignmentId)),
              assignmentId: supporting.assignmentId,
              coachMembershipId: firstMembershipId,
              assignmentKind: "supporting",
            }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          const foreignOwner = await person(client.db, "foreign-owner");
          const foreignOrganizationId = randomUUID();
          await organizationsRouter.createCaller(context(client.db, foreignOwner)).create({
            organizationId: foreignOrganizationId,
            name: "Foreign assignments",
            slug: `foreign-assignments-${foreignOrganizationId}`,
            timezone: "UTC",
          });
          const foreignCoachMembershipId = await staff(
            client.db,
            foreignOrganizationId,
            await person(client.db, "foreign-coach"),
            "coach",
          );
          const currentAfterEnd = await caller.list({ organizationId, engagementId });
          await expect(
            caller.assign({
              organizationId,
              engagementId,
              operationId: randomUUID(),
              expectedStateDigest: digest(currentAfterEnd.items.map((row) => row.assignmentId)),
              coachMembershipId: foreignCoachMembershipId,
              assignmentKind: "supporting",
            }),
          ).rejects.toMatchObject({ code: "NOT_FOUND" });
          const noGrantMembershipId = randomUUID();
          await client.db.insert(organizationMemberships).values({
            id: noGrantMembershipId,
            organization_id: organizationId,
            profile_id: await person(client.db, "no-coach-grant"),
          });
          await expect(
            caller.assign({
              organizationId,
              engagementId,
              operationId: randomUUID(),
              expectedStateDigest: digest(currentAfterEnd.items.map((row) => row.assignmentId)),
              coachMembershipId: noGrantMembershipId,
              assignmentKind: "supporting",
            }),
          ).rejects.toMatchObject({ code: "NOT_FOUND" });
          await client.db
            .update(organizationMemberships)
            .set({ suspended_at: new Date() })
            .where(eq(organizationMemberships.id, inactiveMembershipId));
          await expect(
            caller.assign({
              organizationId,
              engagementId,
              operationId: randomUUID(),
              expectedStateDigest: digest(currentAfterEnd.items.map((row) => row.assignmentId)),
              coachMembershipId: inactiveMembershipId,
              assignmentKind: "supporting",
            }),
          ).rejects.toMatchObject({ code: "NOT_FOUND" });
          const ambiguousOperationId = randomUUID();
          await client.db.insert(organizationAuditEvents).values([
            {
              organization_id: organizationId,
              actor_profile_id: owner,
              actor_membership_id: created.membershipId,
              resource_type: "coaching_assignment",
              resource_id: engagementId,
              action: "organization.coaching_assignment_assigned",
              correlation_id: ambiguousOperationId,
              details: {},
            },
            {
              organization_id: organizationId,
              actor_profile_id: owner,
              actor_membership_id: created.membershipId,
              resource_type: "coaching_assignment",
              resource_id: engagementId,
              action: "different_assignment_action",
              correlation_id: ambiguousOperationId,
              details: {},
            },
          ]);
          await expect(
            caller.assign({
              organizationId,
              engagementId,
              operationId: ambiguousOperationId,
              expectedStateDigest: digest(currentAfterEnd.items.map((row) => row.assignmentId)),
              coachMembershipId: firstMembershipId,
              assignmentKind: "supporting",
            }),
          ).rejects.toMatchObject({ code: "CONFLICT" });
          await client.db
            .update(coachingEngagements)
            .set({ ended_at: new Date(), paused_at: null })
            .where(eq(coachingEngagements.id, engagementId));
          await expect(
            caller.assign({
              organizationId,
              engagementId,
              operationId: randomUUID(),
              expectedStateDigest: digest(currentAfterEnd.items.map((row) => row.assignmentId)),
              coachMembershipId: firstMembershipId,
              assignmentKind: "supporting",
            }),
          ).rejects.toMatchObject({ code: "NOT_FOUND" });
          await expect(
            caller.end({
              organizationId,
              engagementId,
              operationId: endOperationId,
              expectedStateDigest: digest(changed.items.map((row) => row.assignmentId)),
              assignmentId: changedSupporting.assignmentId,
            }),
          ).resolves.toMatchObject({ status: "ended" });
          const pausedEngagementId = randomUUID();
          await client.db.insert(coachingEngagements).values({
            id: pausedEngagementId,
            organization_id: organizationId,
            athlete_profile_id: pausedAthlete,
            paused_at: new Date(),
          });
          await expect(
            caller.assign({
              organizationId,
              engagementId: pausedEngagementId,
              operationId: randomUUID(),
              expectedStateDigest: digest([]),
              coachMembershipId: firstMembershipId,
              assignmentKind: "primary",
            }),
          ).rejects.toMatchObject({ code: "NOT_FOUND" });
          const rollbackEngagementId = randomUUID();
          await client.db.insert(coachingEngagements).values({
            id: rollbackEngagementId,
            organization_id: organizationId,
            athlete_profile_id: rollbackAthlete,
          });
          const rollbackOperationId = randomUUID();
          const suffix = randomUUID().replaceAll("-", "");
          const functionName = `coaching_assignment_receipt_fail_${suffix}`;
          const triggerName = `coaching_assignment_receipt_fail_trigger_${suffix}`;
          await client.db.execute(
            sql.raw(`
              create function ${functionName}() returns trigger language plpgsql as $$
              begin
                if new.correlation_id = '${rollbackOperationId}'::uuid then
                  raise exception 'coaching assignment receipt failure';
                end if;
                return new;
              end;
              $$;
              create trigger ${triggerName} before insert on organization_audit_events
              for each row execute function ${functionName}();
            `),
          );
          try {
            await expect(
              caller.assign({
                organizationId,
                engagementId: rollbackEngagementId,
                operationId: rollbackOperationId,
                expectedStateDigest: digest([]),
                coachMembershipId: firstMembershipId,
                assignmentKind: "primary",
              }),
            ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
          } finally {
            await client.db.execute(
              sql.raw(
                `drop trigger if exists ${triggerName} on organization_audit_events; drop function if exists ${functionName}();`,
              ),
            );
          }
          await expect(
            client.db
              .select({ id: coachingAssignments.id })
              .from(coachingAssignments)
              .where(eq(coachingAssignments.engagement_id, rollbackEngagementId)),
          ).resolves.toEqual([]);
          await expect(
            client.db
              .select({ id: organizationAuditEvents.id })
              .from(organizationAuditEvents)
              .where(eq(organizationAuditEvents.correlation_id, rollbackOperationId)),
          ).resolves.toEqual([]);
        } finally {
          await client.close();
        }
      },
    );
  }, 30_000);
});
