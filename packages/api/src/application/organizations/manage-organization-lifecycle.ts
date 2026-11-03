import type { DrizzleDbClient } from "@repo/db/client";
import {
  createOrganizationLifecycleRepository,
  type OrganizationLifecycleRepository,
} from "../../repositories/organization-lifecycle-repository";

export type OrganizationLifecycleCommandFailure =
  | "forbidden"
  | "not_found"
  | "invalid_cursor"
  | "conflict";

export class OrganizationLifecycleError extends Error {
  constructor(readonly reason: OrganizationLifecycleCommandFailure) {
    super(reason);
    this.name = "OrganizationLifecycleError";
  }
}

function databaseFailure(error: unknown): OrganizationLifecycleError | null {
  const messages = new Set<string>();
  let candidate: unknown = error;
  while (candidate instanceof Error && !messages.has(candidate.message)) {
    messages.add(candidate.message);
    candidate = candidate.cause;
  }
  const message = [...messages].join(" ").toLowerCase();
  if (
    message.includes("organization not found") ||
    message.includes("membership not found") ||
    message.includes("engagement not found")
  )
    return new OrganizationLifecycleError("not_found");
  if (message.includes("correlation_id conflicts"))
    return new OrganizationLifecycleError("conflict");
  if (
    message.includes("actor ") ||
    message.includes("target membership cannot") ||
    message.includes("only the exact athlete") ||
    message.includes("organization is not active") ||
    message.includes("organization is closed")
  )
    return new OrganizationLifecycleError("forbidden");
  return null;
}

async function requireAdmin(
  repository: OrganizationLifecycleRepository,
  organizationId: string,
  actorProfileId: string,
) {
  if (!(await repository.hasCurrentAdministrativeAuthority(organizationId, actorProfileId)))
    throw new OrganizationLifecycleError("forbidden");
}

function page<T extends { membershipId?: string; engagementId?: string }>(
  rows: T[],
  limit: number,
) {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    hasMore: rows.length > limit,
    nextCursor: rows.length > limit ? (last?.membershipId ?? last?.engagementId ?? null) : null,
  };
}

export async function listOrganizationStaff(input: {
  db: DrizzleDbClient;
  actorProfileId: string;
  organizationId: string;
  limit: number;
  cursor: string | null;
}) {
  const repository = createOrganizationLifecycleRepository(input.db);
  await requireAdmin(repository, input.organizationId, input.actorProfileId);
  if (
    input.cursor !== null &&
    !(await repository.staffCursorBelongsToOrganization(input.organizationId, input.cursor))
  )
    throw new OrganizationLifecycleError("invalid_cursor");
  return page(
    await repository.listCurrentStaff(input.organizationId, input.limit, input.cursor),
    input.limit,
  );
}

export async function listAdministrativeAthleteRoster(input: {
  db: DrizzleDbClient;
  actorProfileId: string;
  organizationId: string;
  limit: number;
  cursor: string | null;
}) {
  const repository = createOrganizationLifecycleRepository(input.db);
  await requireAdmin(repository, input.organizationId, input.actorProfileId);
  if (
    input.cursor !== null &&
    !(await repository.rosterCursorBelongsToOrganization(input.organizationId, input.cursor))
  )
    throw new OrganizationLifecycleError("invalid_cursor");
  return page(
    await repository.listCurrentAthleteRoster(input.organizationId, input.limit, input.cursor),
    input.limit,
  );
}

async function command(
  db: DrizzleDbClient,
  operation: (repository: OrganizationLifecycleRepository) => Promise<unknown>,
) {
  try {
    const result = await operation(createOrganizationLifecycleRepository(db));
    if (result === null) throw new OrganizationLifecycleError("not_found");
  } catch (error) {
    const mapped = databaseFailure(error);
    if (mapped) throw mapped;
    throw error;
  }
}

export async function endOrganizationMembership(input: {
  db: DrizzleDbClient;
  actorProfileId: string;
  organizationId: string;
  membershipId: string;
  reason: string;
  correlationId: string;
}) {
  await command(input.db, (repository) => repository.endMembership(input));
  return { membershipId: input.membershipId, status: "ended" as const };
}

export async function endCoachingEngagement(input: {
  db: DrizzleDbClient;
  actorProfileId: string;
  organizationId: string;
  engagementId: string;
  reason: string;
  correlationId: string;
}) {
  await command(input.db, (repository) => repository.endEngagement(input));
  return { engagementId: input.engagementId, status: "ended" as const };
}

export async function withdrawAthleteConsent(input: {
  db: DrizzleDbClient;
  actorProfileId: string;
  organizationId: string;
  consentId: string;
  reason: string;
  correlationId: string;
}) {
  await command(input.db, (repository) => repository.withdrawConsent(input));
  return { consentId: input.consentId, status: "withdrawn" as const };
}
