import { randomUUID } from "node:crypto";
import { createDbClient, type DrizzleDbClient } from "@repo/db/client";
import {
  athleteDataSharingConsents,
  coachingAssignments,
  coachingEngagements,
  organizationAuditEvents,
  organizationGroupCoachAssignments,
  organizationGroups,
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
import { and, eq, isNull, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { organizationsRouter } from "../organizations";

function caller(db: DrizzleDbClient, userId: string) {
  return organizationsRouter.createCaller({
    auth: { lookupInput: { clientType: "web", headers: new Headers() }, session: null },
    authSession: null,
    clientType: "web",
    db,
    headers: new Headers(),
    session: { user: { id: userId, email: "untrusted-session@example.test" } },
    trpcSource: "vitest-live-db",
  } as never);
}

async function person(db: DrizzleDbClient, label: string) {
  const id = randomUUID();
  const email = `${label}-${id}@organization-staff-roles.test`;
  await db.insert(users).values({ id, name: label, email, emailVerified: true });
  await db.insert(profiles).values({
    id,
    email,
    full_name: label,
    username: `${label}-${id.slice(0, 8)}`,
    onboarding_status: "completed",
    is_public: false,
  });
  return { id };
}

async function membership(
  db: DrizzleDbClient,
  organizationId: string,
  profileId: string,
  role?: "admin" | "coach",
) {
  const id = randomUUID();
  await db
    .insert(organizationMemberships)
    .values({ id, organization_id: organizationId, profile_id: profileId });
  if (role)
    await db.insert(organizationMembershipRoleGrants).values({
      organization_id: organizationId,
      membership_id: id,
      role_key: role,
    });
  return id;
}

describe("organization staff roles against a disposable migrated PostgreSQL database", () => {
  it("enforces authority, safely repeats role mutations, and atomically ends coach assignments", async () => {
    await withDisposableDatabase(
      ["--disposable", "--local"],
      "organization_staff_roles",
      async (pool, url) => {
        await bootstrapSupabaseSchemas(pool);
        for (const migration of requireFreshBaseline().migrationPaths)
          await applySqlFile(pool, migration);
        const client = createDbClient({ url });
        try {
          const root = await person(client.db, "root");
          const admin = await person(client.db, "admin");
          const coach = await person(client.db, "coach");
          const target = await person(client.db, "target");
          const suspended = await person(client.db, "suspended");
          const ended = await person(client.db, "ended");
          const athlete = await person(client.db, "athlete");
          const foreignRoot = await person(client.db, "foreign-root");
          const foreignTarget = await person(client.db, "foreign-target");
          const organizationId = randomUUID();
          const foreignOrganizationId = randomUUID();
          const rootCaller = caller(client.db, root.id);
          const created = await rootCaller.create({
            organizationId,
            name: "Staff roles",
            slug: `staff-roles-${organizationId}`,
            timezone: "UTC",
          });
          await caller(client.db, foreignRoot.id).create({
            organizationId: foreignOrganizationId,
            name: "Foreign staff roles",
            slug: `foreign-staff-roles-${foreignOrganizationId}`,
            timezone: "UTC",
          });
          const adminMembershipId = await membership(client.db, organizationId, admin.id, "admin");
          await membership(client.db, organizationId, coach.id, "coach");
          const targetMembershipId = await membership(client.db, organizationId, target.id);
          const suspendedMembershipId = await membership(client.db, organizationId, suspended.id);
          const endedMembershipId = await membership(client.db, organizationId, ended.id);
          const foreignTargetMembershipId = await membership(
            client.db,
            foreignOrganizationId,
            foreignTarget.id,
          );
          await client.db
            .update(organizationMemberships)
            .set({ suspended_at: new Date() })
            .where(eq(organizationMemberships.id, suspendedMembershipId));
          await client.db
            .update(organizationMemberships)
            .set({ ended_at: new Date() })
            .where(eq(organizationMemberships.id, endedMembershipId));

          await expect(
            caller(client.db, admin.id).staffRoles.grant({
              organizationId,
              membershipId: targetMembershipId,
              role: "admin",
              operationId: randomUUID(),
            }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          await expect(
            rootCaller.staffRoles.grant({
              organizationId,
              membershipId: created.membershipId,
              role: "coach",
              operationId: randomUUID(),
            }),
          ).resolves.toMatchObject({ status: "granted" });
          await expect(
            caller(client.db, admin.id).staffRoles.grant({
              organizationId,
              membershipId: adminMembershipId,
              role: "coach",
              operationId: randomUUID(),
            }),
          ).resolves.toMatchObject({ status: "granted" });
          await expect(
            caller(client.db, admin.id).staffRoles.revoke({
              organizationId,
              membershipId: adminMembershipId,
              role: "coach",
              operationId: randomUUID(),
            }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          await expect(
            rootCaller.staffRoles.revoke({
              organizationId,
              membershipId: created.membershipId,
              role: "admin",
              operationId: randomUUID(),
            }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          expect(
            await client.db
              .select()
              .from(coachingAssignments)
              .where(eq(coachingAssignments.organization_id, organizationId)),
          ).toHaveLength(0);
          expect(
            await client.db
              .select()
              .from(athleteDataSharingConsents)
              .where(eq(athleteDataSharingConsents.organization_id, organizationId)),
          ).toHaveLength(0);
          await expect(
            caller(client.db, coach.id).staffRoles.grant({
              organizationId,
              membershipId: targetMembershipId,
              role: "coach",
              operationId: randomUUID(),
            }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          await expect(
            rootCaller.staffRoles.grant({
              organizationId,
              membershipId: adminMembershipId,
              role: "coach",
              operationId: randomUUID(),
            }),
          ).resolves.toMatchObject({ status: "granted" });
          for (const membershipId of [
            foreignTargetMembershipId,
            suspendedMembershipId,
            endedMembershipId,
          ])
            await expect(
              rootCaller.staffRoles.grant({
                organizationId,
                membershipId,
                role: "coach",
                operationId: randomUUID(),
              }),
            ).rejects.toMatchObject({ code: "FORBIDDEN" });

          const grantOperationId = randomUUID();
          // Deliberately discard the first durable response, as a client that
          // loses its acknowledgement would, then retry with the same id.
          await caller(client.db, admin.id).staffRoles.grant({
            organizationId,
            membershipId: targetMembershipId,
            role: "coach",
            operationId: grantOperationId,
          });
          await expect(
            caller(client.db, admin.id).staffRoles.grant({
              organizationId,
              membershipId: targetMembershipId,
              role: "coach",
              operationId: grantOperationId,
            }),
          ).resolves.toMatchObject({ status: "granted" });
          const grantReceipts = await client.db
            .select({
              correlationId: organizationAuditEvents.correlation_id,
              action: organizationAuditEvents.action,
              actorProfileId: organizationAuditEvents.actor_profile_id,
              actorMembershipId: organizationAuditEvents.actor_membership_id,
              resourceId: organizationAuditEvents.resource_id,
              details: organizationAuditEvents.details,
            })
            .from(organizationAuditEvents)
            .where(
              and(
                eq(organizationAuditEvents.organization_id, organizationId),
                eq(organizationAuditEvents.correlation_id, grantOperationId),
              ),
            );
          expect(grantReceipts).toEqual([
            {
              correlationId: grantOperationId,
              action: "organization.staff_role_granted",
              actorProfileId: admin.id,
              actorMembershipId: adminMembershipId,
              resourceId: targetMembershipId,
              details: { role_key: "coach" },
            },
          ]);
          const grantNoopOperationId = randomUUID();
          await expect(
            caller(client.db, admin.id).staffRoles.grant({
              organizationId,
              membershipId: targetMembershipId,
              role: "coach",
              operationId: grantNoopOperationId,
            }),
          ).resolves.toMatchObject({ status: "granted" });
          const noopGrantReceipts = await client.db
            .select({
              correlationId: organizationAuditEvents.correlation_id,
              action: organizationAuditEvents.action,
              actorProfileId: organizationAuditEvents.actor_profile_id,
              actorMembershipId: organizationAuditEvents.actor_membership_id,
              resourceId: organizationAuditEvents.resource_id,
              details: organizationAuditEvents.details,
            })
            .from(organizationAuditEvents)
            .where(
              and(
                eq(organizationAuditEvents.organization_id, organizationId),
                eq(organizationAuditEvents.correlation_id, grantNoopOperationId),
              ),
            );
          expect(noopGrantReceipts).toEqual([
            {
              correlationId: grantNoopOperationId,
              action: "organization.staff_role_granted",
              actorProfileId: admin.id,
              actorMembershipId: adminMembershipId,
              resourceId: targetMembershipId,
              details: { role_key: "coach" },
            },
          ]);
          await Promise.all([
            rootCaller.staffRoles.grant({
              organizationId,
              membershipId: targetMembershipId,
              role: "coach",
              operationId: randomUUID(),
            }),
            rootCaller.staffRoles.grant({
              organizationId,
              membershipId: targetMembershipId,
              role: "coach",
              operationId: randomUUID(),
            }),
          ]);
          expect(
            await client.db
              .select()
              .from(organizationMembershipRoleGrants)
              .where(
                and(
                  eq(organizationMembershipRoleGrants.organization_id, organizationId),
                  eq(organizationMembershipRoleGrants.membership_id, targetMembershipId),
                  eq(organizationMembershipRoleGrants.role_key, "coach"),
                  isNull(organizationMembershipRoleGrants.revoked_at),
                ),
              ),
          ).toHaveLength(1);

          const engagementId = randomUUID();
          const groupId = randomUUID();
          await client.db.insert(coachingEngagements).values({
            id: engagementId,
            organization_id: organizationId,
            athlete_profile_id: athlete.id,
          });
          await client.db.insert(coachingAssignments).values({
            organization_id: organizationId,
            engagement_id: engagementId,
            coach_membership_id: targetMembershipId,
            assignment_kind: "primary",
          });
          await client.db.insert(organizationGroups).values({
            id: groupId,
            organization_id: organizationId,
            name: "Role group",
            description: null,
            created_by_membership_id: created.membershipId,
          });
          await client.db.insert(organizationGroupCoachAssignments).values({
            organization_id: organizationId,
            group_id: groupId,
            coach_membership_id: targetMembershipId,
            assigned_by_membership_id: created.membershipId,
          });
          const revokeOperationId = randomUUID();
          await expect(
            rootCaller.staffRoles.revoke({
              organizationId,
              membershipId: targetMembershipId,
              role: "coach",
              operationId: revokeOperationId,
            }),
          ).resolves.toMatchObject({ status: "revoked" });
          const revokeReceipts = await client.db
            .select({
              correlationId: organizationAuditEvents.correlation_id,
              action: organizationAuditEvents.action,
              actorProfileId: organizationAuditEvents.actor_profile_id,
              actorMembershipId: organizationAuditEvents.actor_membership_id,
              resourceId: organizationAuditEvents.resource_id,
              details: organizationAuditEvents.details,
            })
            .from(organizationAuditEvents)
            .where(
              and(
                eq(organizationAuditEvents.organization_id, organizationId),
                eq(organizationAuditEvents.correlation_id, revokeOperationId),
              ),
            );
          expect(revokeReceipts).toEqual([
            {
              correlationId: revokeOperationId,
              action: "organization.staff_role_revoked",
              actorProfileId: root.id,
              actorMembershipId: created.membershipId,
              resourceId: targetMembershipId,
              details: {
                role_key: "coach",
                ended_direct_assignments: 1,
                ended_group_assignments: 1,
              },
            },
          ]);
          await expect(
            rootCaller.staffRoles.revoke({
              organizationId,
              membershipId: targetMembershipId,
              role: "coach",
              operationId: randomUUID(),
            }),
          ).resolves.toMatchObject({ status: "revoked" });
          expect(
            await client.db
              .select()
              .from(coachingAssignments)
              .where(
                and(
                  eq(coachingAssignments.organization_id, organizationId),
                  isNull(coachingAssignments.ended_at),
                ),
              ),
          ).toHaveLength(0);
          const groupAssignment = await client.db
            .select()
            .from(organizationGroupCoachAssignments)
            .where(eq(organizationGroupCoachAssignments.organization_id, organizationId));
          expect(groupAssignment[0]).toMatchObject({
            ended_by_membership_id: created.membershipId,
          });
          expect(
            await client.db
              .select()
              .from(organizationAuditEvents)
              .where(
                and(
                  eq(organizationAuditEvents.organization_id, organizationId),
                  eq(organizationAuditEvents.action, "organization.staff_role_revoked"),
                ),
              ),
          ).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ actor_membership_id: created.membershipId }),
            ]),
          );
          const auditCountBeforeReplay = (
            await client.db
              .select()
              .from(organizationAuditEvents)
              .where(eq(organizationAuditEvents.organization_id, organizationId))
          ).length;
          await expect(
            caller(client.db, admin.id).staffRoles.grant({
              organizationId,
              membershipId: targetMembershipId,
              role: "coach",
              operationId: grantOperationId,
            }),
          ).resolves.toMatchObject({ status: "granted" });
          expect(
            await client.db
              .select()
              .from(organizationMembershipRoleGrants)
              .where(
                and(
                  eq(organizationMembershipRoleGrants.organization_id, organizationId),
                  eq(organizationMembershipRoleGrants.membership_id, targetMembershipId),
                  eq(organizationMembershipRoleGrants.role_key, "coach"),
                  isNull(organizationMembershipRoleGrants.revoked_at),
                ),
              ),
          ).toHaveLength(0);
          expect(
            (
              await client.db
                .select()
                .from(organizationAuditEvents)
                .where(eq(organizationAuditEvents.organization_id, organizationId))
            ).length,
          ).toBe(auditCountBeforeReplay);

          const revokeNoopOperationId = randomUUID();
          await rootCaller.staffRoles.revoke({
            organizationId,
            membershipId: targetMembershipId,
            role: "coach",
            operationId: revokeNoopOperationId,
          });
          const revokeNoopReceipts = await client.db
            .select({
              correlationId: organizationAuditEvents.correlation_id,
              action: organizationAuditEvents.action,
              actorProfileId: organizationAuditEvents.actor_profile_id,
              actorMembershipId: organizationAuditEvents.actor_membership_id,
              resourceId: organizationAuditEvents.resource_id,
              details: organizationAuditEvents.details,
            })
            .from(organizationAuditEvents)
            .where(
              and(
                eq(organizationAuditEvents.organization_id, organizationId),
                eq(organizationAuditEvents.correlation_id, revokeNoopOperationId),
              ),
            );
          expect(revokeNoopReceipts).toEqual([
            {
              correlationId: revokeNoopOperationId,
              action: "organization.staff_role_revoked",
              actorProfileId: root.id,
              actorMembershipId: created.membershipId,
              resourceId: targetMembershipId,
              details: {
                role_key: "coach",
                ended_direct_assignments: 0,
                ended_group_assignments: 0,
              },
            },
          ]);
          await rootCaller.staffRoles.grant({
            organizationId,
            membershipId: targetMembershipId,
            role: "coach",
            operationId: randomUUID(),
          });
          const auditCountBeforeInverseReplay = (
            await client.db
              .select()
              .from(organizationAuditEvents)
              .where(eq(organizationAuditEvents.organization_id, organizationId))
          ).length;
          await expect(
            rootCaller.staffRoles.revoke({
              organizationId,
              membershipId: targetMembershipId,
              role: "coach",
              operationId: revokeNoopOperationId,
            }),
          ).resolves.toMatchObject({ status: "revoked" });
          await expect(
            rootCaller.staffRoles.grant({
              organizationId,
              membershipId: targetMembershipId,
              role: "coach",
              operationId: revokeNoopOperationId,
            }),
          ).rejects.toMatchObject({ code: "CONFLICT" });
          expect(
            (
              await client.db
                .select()
                .from(organizationAuditEvents)
                .where(eq(organizationAuditEvents.organization_id, organizationId))
            ).length,
          ).toBe(auditCountBeforeInverseReplay);
          expect(
            await client.db
              .select()
              .from(organizationMembershipRoleGrants)
              .where(
                and(
                  eq(organizationMembershipRoleGrants.organization_id, organizationId),
                  eq(organizationMembershipRoleGrants.membership_id, targetMembershipId),
                  eq(organizationMembershipRoleGrants.role_key, "coach"),
                  isNull(organizationMembershipRoleGrants.revoked_at),
                ),
              ),
          ).toHaveLength(1);

          const rollbackTarget = await person(client.db, "rollback-target");
          const rollbackTargetMembershipId = await membership(
            client.db,
            organizationId,
            rollbackTarget.id,
          );
          const rollbackOperationId = randomUUID();
          const suffix = randomUUID().replaceAll("-", "");
          const functionName = `staff_role_audit_fail_${suffix}`;
          const triggerName = `staff_role_audit_fail_trigger_${suffix}`;
          // This trigger exists only in the guarded disposable database. It
          // fails after the role insert and proves the transaction rolls the
          // grant back when durable receipt recording cannot complete.
          await client.db.execute(
            sql.raw(`
               create function ${functionName}() returns trigger language plpgsql as $$
               begin
                 if new.correlation_id = '${rollbackOperationId}'::uuid then
                   raise exception 'staff role audit receipt failure';
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
              rootCaller.staffRoles.grant({
                organizationId,
                membershipId: rollbackTargetMembershipId,
                role: "coach",
                operationId: rollbackOperationId,
              }),
            ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
          } finally {
            await client.db.execute(
              sql.raw(
                `drop trigger if exists ${triggerName} on organization_audit_events; drop function if exists ${functionName}();`,
              ),
            );
          }
          expect(
            await client.db
              .select()
              .from(organizationMembershipRoleGrants)
              .where(
                and(
                  eq(organizationMembershipRoleGrants.organization_id, organizationId),
                  eq(organizationMembershipRoleGrants.membership_id, rollbackTargetMembershipId),
                  eq(organizationMembershipRoleGrants.role_key, "coach"),
                  isNull(organizationMembershipRoleGrants.revoked_at),
                ),
              ),
          ).toHaveLength(0);
          expect(
            await client.db
              .select()
              .from(organizationAuditEvents)
              .where(eq(organizationAuditEvents.correlation_id, rollbackOperationId)),
          ).toHaveLength(0);
        } finally {
          await client.close();
        }
      },
    );
  });
});
