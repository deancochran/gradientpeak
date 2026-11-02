import {
  ORGANIZATION_ROLE_KEYS,
  type OrganizationContext,
  type OrganizationRoleKey,
  type OrganizationStaffMembershipSummary,
  organizationContextSchema,
  organizationRoleKeySchema,
  organizationStaffMembershipSummarySchema,
} from "@repo/core/organizations";
import { z } from "zod";
import type {
  OrganizationAccessRepository,
  OrganizationListCursor,
  OrganizationMembershipContextRow,
} from "../../repositories/organization-access-repository";

const cursorVersion = 1;
const organizationListCursorPayloadSchema = z
  .object({
    v: z.literal(cursorVersion),
    n: z.string().min(1).max(120),
    s: z.string().min(1).max(120),
    i: z.string().uuid(),
  })
  .strict();

export type OrganizationMembershipContext = {
  organization: OrganizationContext;
  membership: OrganizationStaffMembershipSummary;
  isRootOwner: boolean;
};

export type OrganizationListPage = {
  items: OrganizationMembershipContext[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type OrganizationCoachingAccess =
  | {
      status: "granted";
      organization: { id: string; name: string; slug: string };
    }
  | { status: "forbidden" };

export function decodeOrganizationListCursor(value: string): OrganizationListCursor | null {
  try {
    const decoded = organizationListCursorPayloadSchema.safeParse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
    );
    if (!decoded.success) return null;
    return {
      name: decoded.data.n,
      slug: decoded.data.s,
      organizationId: decoded.data.i,
    };
  } catch {
    return null;
  }
}

function encodeOrganizationListCursor(row: OrganizationMembershipContextRow): string {
  return Buffer.from(
    JSON.stringify({
      v: cursorVersion,
      n: row.name,
      s: row.slug,
      i: row.organizationId,
    }),
  ).toString("base64url");
}

function toIsoString(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function sortRoles(roles: readonly string[]): OrganizationRoleKey[] {
  const activeRoles = new Set(roles.map((role) => organizationRoleKeySchema.parse(role)));
  return ORGANIZATION_ROLE_KEYS.filter((role) => activeRoles.has(role));
}

function mapContext(row: OrganizationMembershipContextRow): OrganizationMembershipContext {
  const organization = organizationContextSchema.parse({
    organizationId: row.organizationId,
    rootOwnerMembershipId: row.rootOwnerMembershipId,
    name: row.name,
    slug: row.slug,
    timezone: row.timezone,
    suspendedAt: toIsoString(row.organizationSuspendedAt),
    closedAt: toIsoString(row.organizationClosedAt),
    createdAt: row.organizationCreatedAt.toISOString(),
    updatedAt: row.organizationUpdatedAt.toISOString(),
  });
  const membership = organizationStaffMembershipSummarySchema.parse({
    membershipId: row.membershipId,
    profileId: row.profileId,
    roles: sortRoles(row.roleKeys),
    suspendedAt: toIsoString(row.membershipSuspendedAt),
    endedAt: toIsoString(row.membershipEndedAt),
  });
  return {
    organization,
    membership,
    isRootOwner: row.rootOwnerMembershipId === row.membershipId,
  };
}

function isActiveContextRow(row: OrganizationMembershipContextRow): boolean {
  return (
    row.organizationSuspendedAt === null &&
    row.organizationClosedAt === null &&
    row.membershipSuspendedAt === null &&
    row.membershipEndedAt === null
  );
}

function hasEffectiveShellCapability(row: OrganizationMembershipContextRow): boolean {
  return row.roleKeys.length > 0 || row.rootOwnerMembershipId === row.membershipId;
}

export async function listMyOrganizationContexts({
  repository,
  profileId,
  limit,
  cursor,
}: {
  repository: OrganizationAccessRepository;
  profileId: string;
  limit: number;
  cursor: OrganizationListCursor | null;
}): Promise<OrganizationListPage> {
  const rows = await repository.listActiveMembershipContexts({
    profileId,
    limit,
    cursor,
  });
  if (rows.some((row) => !isActiveContextRow(row) || !hasEffectiveShellCapability(row))) {
    throw new Error("Repository returned an inactive or roleless organization context");
  }
  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  const lastRow = pageRows[pageRows.length - 1];
  return {
    items: pageRows.map(mapContext),
    hasMore,
    nextCursor: hasMore && lastRow ? encodeOrganizationListCursor(lastRow) : null,
  };
}

export async function readOrganizationContext({
  repository,
  organizationId,
  profileId,
}: {
  repository: OrganizationAccessRepository;
  organizationId: string;
  profileId: string;
}): Promise<OrganizationMembershipContext | null> {
  const row = await repository.findActiveMembershipContext({
    organizationId,
    profileId,
  });
  if (!row || !isActiveContextRow(row) || !hasEffectiveShellCapability(row)) {
    return null;
  }
  return mapContext(row);
}

export async function readOrganizationCoachingAccess({
  repository,
  organizationId,
  profileId,
}: {
  repository: OrganizationAccessRepository;
  organizationId: string;
  profileId: string;
}): Promise<OrganizationCoachingAccess> {
  const context = await readOrganizationContext({
    repository,
    organizationId,
    profileId,
  });
  return context
    ? {
        status: "granted",
        organization: {
          id: context.organization.organizationId,
          name: context.organization.name,
          slug: context.organization.slug,
        },
      }
    : { status: "forbidden" };
}
