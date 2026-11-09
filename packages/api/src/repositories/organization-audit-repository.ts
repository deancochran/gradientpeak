import {
  organizationAuditEvents,
  organizationMembershipRoleGrants,
  organizationMemberships,
  organizations,
  profiles,
} from "@repo/db";
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { DrizzleQueryExecutor } from "../db";

export type OrganizationAuditCursor = { occurredAtCursor: string; eventId: string };

export type OrganizationAuditRepository = ReturnType<typeof createOrganizationAuditRepository>;

export function createOrganizationAuditRepository(
  db: DrizzleQueryExecutor,
  options: { beforeList?: () => Promise<void> } = {},
) {
  return {
    async listEvents(input: {
      organizationId: string;
      requesterProfileId: string;
      limit: number;
      cursor: OrganizationAuditCursor | null;
      action: string | null;
      actorProfileId: string | null;
      resourceType: string | null;
      resourceId: string | null;
      fromInclusive: Date | null;
      toExclusive: Date | null;
    }) {
      await options.beforeList?.();
      // Authorization and events share one PostgreSQL statement snapshot. A revocation after this
      // statement begins cannot retract a response already being formed, but a revocation before
      // it begins produces no authorized row and is reported as forbidden by the application.
      return db
        .select({
          authorizedMembershipId: organizationMemberships.id,
          eventId: organizationAuditEvents.id,
          occurredAt: organizationAuditEvents.occurred_at,
          // PostgreSQL timestamps retain microseconds while JavaScript Date retains milliseconds.
          // This exact UTC6 value is internal pagination state only; it is never a public event DTO.
          occurredAtCursor: sql<string>`to_char(
            ${organizationAuditEvents.occurred_at} at time zone 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
          )`,
          action: organizationAuditEvents.action,
          resourceType: organizationAuditEvents.resource_type,
          resourceId: organizationAuditEvents.resource_id,
          details: organizationAuditEvents.details,
          actorProfileId: organizationAuditEvents.actor_profile_id,
          actorDisplayName: profiles.full_name,
          actorUsername: profiles.username,
        })
        .from(organizationMemberships)
        .innerJoin(organizations, eq(organizations.id, organizationMemberships.organization_id))
        .leftJoin(
          organizationAuditEvents,
          and(
            eq(organizationAuditEvents.organization_id, input.organizationId),
            ...(input.action ? [eq(organizationAuditEvents.action, input.action)] : []),
            ...(input.actorProfileId
              ? [eq(organizationAuditEvents.actor_profile_id, input.actorProfileId)]
              : []),
            ...(input.resourceType
              ? [eq(organizationAuditEvents.resource_type, input.resourceType)]
              : []),
            ...(input.resourceId
              ? [eq(organizationAuditEvents.resource_id, input.resourceId)]
              : []),
            ...(input.fromInclusive
              ? [sql`${organizationAuditEvents.occurred_at} >= ${input.fromInclusive}`]
              : []),
            ...(input.toExclusive
              ? [lt(organizationAuditEvents.occurred_at, input.toExclusive)]
              : []),
            ...(input.cursor
              ? [
                  or(
                    lt(
                      organizationAuditEvents.occurred_at,
                      sql`${input.cursor.occurredAtCursor}::timestamptz`,
                    ),
                    and(
                      eq(
                        organizationAuditEvents.occurred_at,
                        sql`${input.cursor.occurredAtCursor}::timestamptz`,
                      ),
                      lt(organizationAuditEvents.id, input.cursor.eventId),
                    ),
                  ),
                ]
              : []),
          ),
        )
        .leftJoin(profiles, eq(profiles.id, organizationAuditEvents.actor_profile_id))
        .where(
          and(
            eq(organizationMemberships.organization_id, input.organizationId),
            eq(organizationMemberships.profile_id, input.requesterProfileId),
            isNull(organizationMemberships.suspended_at),
            isNull(organizationMemberships.ended_at),
            isNull(organizations.suspended_at),
            isNull(organizations.closed_at),
            or(
              eq(organizations.root_owner_membership_id, organizationMemberships.id),
              sql`exists (
                select 1 from ${organizationMembershipRoleGrants}
                where ${organizationMembershipRoleGrants.organization_id} = ${input.organizationId}
                  and ${organizationMembershipRoleGrants.membership_id} = ${organizationMemberships.id}
                  and ${organizationMembershipRoleGrants.role_key} = 'admin'
                  and ${organizationMembershipRoleGrants.granted_at} <= transaction_timestamp()
                  and ${organizationMembershipRoleGrants.revoked_at} is null
              )`,
            ),
          ),
        )
        .orderBy(desc(organizationAuditEvents.occurred_at), desc(organizationAuditEvents.id))
        .limit(input.limit + 1);
    },
  };
}
