import { randomUUID } from "node:crypto";
import { createDbClient, type DrizzleDbClient } from "@repo/db/client";
import {
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
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { readOrganizationAuditHistory } from "../../application/organizations/read-organization-audit-history";
import { createOrganizationAuditRepository } from "../../repositories/organization-audit-repository";
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
  await db
    .insert(users)
    .values({ id, name: label, email: `${label}-${id}@audit.test`, emailVerified: true });
  await db.insert(profiles).values({
    id,
    email: `${label}-${id}@audit.test`,
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

function withCursorTimestamp(cursor: string, timestamp: string) {
  const payload: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  if (typeof payload !== "object" || payload === null || Array.isArray(payload))
    throw new Error("Expected an audit cursor object");
  return Buffer.from(JSON.stringify({ ...payload, t: timestamp })).toString("base64url");
}

describe("organization audit history API against a disposable migrated PostgreSQL database", () => {
  it("scopes deterministic, redacted audit metadata to active administrators", async () => {
    await withDisposableDatabase(
      ["--disposable", "--local"],
      "organization_audit_history",
      async (pool, url) => {
        await bootstrapSupabaseSchemas(pool);
        for (const migration of requireFreshBaseline().migrationPaths)
          await applySqlFile(pool, migration);
        const client = createDbClient({ url });
        try {
          const owner = await person(client.db, "owner");
          const admin = await person(client.db, "admin");
          const coach = await person(client.db, "coach");
          const foreignOwner = await person(client.db, "foreign-owner");
          const organizationId = randomUUID();
          const foreignOrganizationId = randomUUID();
          const ownerCreated = await caller(client.db, owner).create({
            organizationId,
            name: "Audit",
            slug: `audit-${organizationId}`,
            timezone: "UTC",
          });
          const foreignCreated = await caller(client.db, foreignOwner).create({
            organizationId: foreignOrganizationId,
            name: "Foreign",
            slug: `foreign-${foreignOrganizationId}`,
            timezone: "UTC",
          });
          const adminMembershipId = await staff(client.db, organizationId, admin, "admin");
          await staff(client.db, organizationId, coach, "coach");
          const newestId = randomUUID();
          const olderId = randomUUID();
          const microsecondEvents = [
            { id: randomUUID(), occurredAt: "2026-11-07T23:59:59.999100Z" },
            { id: randomUUID(), occurredAt: "2026-11-07T23:59:59.999500Z" },
            { id: randomUUID(), occurredAt: "2026-11-07T23:59:59.999900Z" },
          ];
          const microsecondIds = microsecondEvents.map((event) => event.id);
          const nextDayId = randomUUID();
          const sameTimestampIds = [randomUUID(), randomUUID(), randomUUID()];
          await client.db.insert(organizationAuditEvents).values([
            {
              id: newestId,
              organization_id: organizationId,
              actor_profile_id: owner,
              actor_membership_id: ownerCreated.membershipId,
              action: "organization.membership_ended",
              resource_type: "organization_membership",
              resource_id: adminMembershipId,
              occurred_at: new Date("2026-11-08T12:00:00.000Z"),
              details: { private_message: "must never leave the server", token: "also secret" },
            },
            {
              id: olderId,
              organization_id: organizationId,
              actor_profile_id: owner,
              actor_membership_id: ownerCreated.membershipId,
              action: "group_relationship_created",
              resource_type: "organization_group_athletes",
              resource_id: randomUUID(),
              occurred_at: new Date("2026-11-07T12:00:00.000Z"),
              details: {},
            },
            ...sameTimestampIds.map((id) => ({
              id,
              organization_id: organizationId,
              actor_profile_id: owner,
              actor_membership_id: ownerCreated.membershipId,
              action: "same.timestamp",
              resource_type: "organization_membership",
              resource_id: adminMembershipId,
              occurred_at: new Date("2026-11-06T12:00:00.000Z"),
              details: {},
            })),
            ...microsecondEvents.map((event) => ({
              id: event.id,
              organization_id: organizationId,
              actor_profile_id: owner,
              actor_membership_id: ownerCreated.membershipId,
              action: "microsecond.cursor",
              resource_type: "organization_membership",
              resource_id: adminMembershipId,
              occurred_at: sql`${event.occurredAt}::timestamptz`,
              details: {},
            })),
            {
              id: nextDayId,
              organization_id: organizationId,
              actor_profile_id: owner,
              actor_membership_id: ownerCreated.membershipId,
              action: "boundary.excluded",
              resource_type: "organization_membership",
              resource_id: adminMembershipId,
              occurred_at: new Date("2026-11-08T00:00:00.000Z"),
              details: {},
            },
          ]);
          await client.db.insert(organizationAuditEvents).values({
            organization_id: foreignOrganizationId,
            actor_profile_id: foreignOwner,
            actor_membership_id: foreignCreated.membershipId,
            action: "foreign.action",
            resource_type: "foreign_resource",
            occurred_at: new Date("2026-11-09T12:00:00.000Z"),
            details: { secret: "foreign" },
          });

          const firstPage = await caller(client.db, admin).auditHistory.list({
            organizationId,
            limit: 1,
          });
          expect(firstPage.items).toHaveLength(1);
          expect(firstPage.items[0]).toMatchObject({
            eventId: newestId,
            details: "redacted",
            actor: { profileId: owner, displayName: "owner" },
          });
          expect(JSON.stringify(firstPage.items[0])).not.toContain("must never leave");
          expect(JSON.stringify(firstPage.items[0])).not.toContain("also secret");
          expect(firstPage.nextCursor).toEqual(expect.any(String));
          const cursor = firstPage.nextCursor;
          if (!cursor) throw new Error("Expected a next cursor");
          for (const invalidTimestamp of [
            "2026-99-01T00:00:00.000000Z",
            "2026-04-31T00:00:00.000000Z",
            "2026-02-29T00:00:00.000000Z",
            "0000-01-01T00:00:00.000000Z",
          ])
            await expect(
              caller(client.db, admin).auditHistory.list({
                organizationId,
                limit: 1,
                cursor: withCursorTimestamp(cursor, invalidTimestamp),
              }),
            ).rejects.toMatchObject({ code: "BAD_REQUEST" });
          const secondPage = await caller(client.db, admin).auditHistory.list({
            organizationId,
            limit: 1,
            cursor: firstPage.nextCursor,
          });
          expect(secondPage.items).toEqual([
            expect.objectContaining({ eventId: nextDayId, details: "none" }),
          ]);
          await expect(
            caller(client.db, admin).auditHistory.list({
              organizationId,
              limit: 1,
              cursor: firstPage.nextCursor,
              action: "group_relationship_created",
            }),
          ).rejects.toMatchObject({ code: "BAD_REQUEST" });
          const filtered = await caller(client.db, admin).auditHistory.list({
            organizationId,
            limit: 10,
            action: "group_relationship_created",
            actorProfileId: owner,
            resourceType: "organization_group_athletes",
            fromInclusive: new Date("2026-11-07T00:00:00.000Z"),
            toExclusive: new Date("2026-11-08T00:00:00.000Z"),
          });
          expect(filtered.items).toEqual([expect.objectContaining({ eventId: olderId })]);
          const utcDay = await caller(client.db, admin).auditHistory.list({
            organizationId,
            limit: 10,
            resourceId: adminMembershipId,
            fromInclusive: new Date("2026-11-07T00:00:00.000Z"),
            toExclusive: new Date("2026-11-08T00:00:00.000Z"),
          });
          expect(utcDay.items).toEqual(
            expect.arrayContaining(
              microsecondIds.map((eventId) => expect.objectContaining({ eventId })),
            ),
          );
          expect(utcDay.items).not.toEqual(
            expect.arrayContaining([expect.objectContaining({ eventId: nextDayId })]),
          );
          const sameTimestampFirst = await caller(client.db, admin).auditHistory.list({
            organizationId,
            limit: 1,
            action: "same.timestamp",
            resourceType: "organization_membership",
          });
          const sameTimestampSecond = await caller(client.db, admin).auditHistory.list({
            organizationId,
            limit: 2,
            action: "same.timestamp",
            resourceType: "organization_membership",
            cursor: sameTimestampFirst.nextCursor,
          });
          expect([
            ...sameTimestampFirst.items.map((item) => item.eventId),
            ...sameTimestampSecond.items.map((item) => item.eventId),
          ]).toEqual(expect.arrayContaining(sameTimestampIds));
          expect(
            new Set([
              ...sameTimestampFirst.items.map((item) => item.eventId),
              ...sameTimestampSecond.items.map((item) => item.eventId),
            ]),
          ).toHaveLength(3);
          const microsecondFirst = await caller(client.db, admin).auditHistory.list({
            organizationId,
            limit: 1,
            action: "microsecond.cursor",
          });
          const microsecondSecond = await caller(client.db, admin).auditHistory.list({
            organizationId,
            limit: 1,
            action: "microsecond.cursor",
            cursor: microsecondFirst.nextCursor,
          });
          const microsecondThird = await caller(client.db, admin).auditHistory.list({
            organizationId,
            limit: 1,
            action: "microsecond.cursor",
            cursor: microsecondSecond.nextCursor,
          });
          const pagedMicrosecondIds = [
            ...microsecondFirst.items,
            ...microsecondSecond.items,
            ...microsecondThird.items,
          ].map((item) => item.eventId);
          expect(pagedMicrosecondIds).toEqual(expect.arrayContaining(microsecondIds));
          expect(new Set(pagedMicrosecondIds)).toHaveLength(3);
          const plan = await client.db.execute(sql`
            explain (costs off)
            select id from organization_audit_events
            where organization_id = ${organizationId}::uuid
              and occurred_at < ${new Date("2026-11-09T00:00:00.000Z")}
            order by occurred_at desc, id desc
            limit 20
          `);
          expect(JSON.stringify(plan.rows)).toContain("organization_audit_events");
          await expect(
            caller(client.db, admin).auditHistory.list({
              organizationId,
              limit: 1,
              action: "same.timestamp",
              resourceType: "organization_membership",
              resourceId: adminMembershipId,
              cursor: sameTimestampFirst.nextCursor,
            }),
          ).rejects.toMatchObject({ code: "BAD_REQUEST" });
          await expect(
            caller(client.db, admin).auditHistory.list({
              organizationId,
              limit: 10,
              cursor: "not-a-cursor",
            }),
          ).rejects.toMatchObject({ code: "BAD_REQUEST" });
          await expect(
            caller(client.db, coach).auditHistory.list({ organizationId, limit: 10 }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          await expect(
            caller(client.db, admin).auditHistory.list({
              organizationId: foreignOrganizationId,
              limit: 10,
            }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          await client.db
            .update(organizationMemberships)
            .set({ ended_at: new Date() })
            .where(eq(organizationMemberships.id, adminMembershipId));
          await expect(
            caller(client.db, admin).auditHistory.list({ organizationId, limit: 10 }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });

          const roleOnlyAdmin = await person(client.db, "role-only-admin");
          const roleOnlyMembershipId = await staff(
            client.db,
            organizationId,
            roleOnlyAdmin,
            "admin",
          );
          await client.db
            .update(organizationMembershipRoleGrants)
            .set({ revoked_at: sql`transaction_timestamp()` })
            .where(eq(organizationMembershipRoleGrants.membership_id, roleOnlyMembershipId));
          await expect(
            caller(client.db, roleOnlyAdmin).auditHistory.list({ organizationId, limit: 10 }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });

          const barrierAdmin = await person(client.db, "barrier-admin");
          const barrierMembershipId = await staff(client.db, organizationId, barrierAdmin, "admin");
          const repository = createOrganizationAuditRepository(client.db, {
            beforeList: async () => {
              await client.db
                .update(organizationMembershipRoleGrants)
                .set({ revoked_at: sql`transaction_timestamp()` })
                .where(eq(organizationMembershipRoleGrants.membership_id, barrierMembershipId));
            },
          });
          await expect(
            readOrganizationAuditHistory({
              db: client.db,
              repository,
              actorProfileId: barrierAdmin,
              organizationId,
              limit: 10,
              cursor: null,
              action: null,
              auditActorProfileId: null,
              resourceType: null,
              resourceId: null,
              fromInclusive: null,
              toExclusive: null,
            }),
          ).rejects.toMatchObject({ reason: "forbidden" });
        } finally {
          await client.close();
        }
      },
    );
  });
});
