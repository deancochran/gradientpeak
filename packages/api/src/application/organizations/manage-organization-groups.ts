import type { DrizzleDbClient } from "@repo/db/client";
import { createOrganizationGroupManagementRepository } from "../../repositories/organization-group-management-repository";

export class OrganizationGroupManagementError extends Error {
  constructor(readonly reason: "forbidden" | "not_found" | "conflict" | "invalid_cursor") {
    super(reason);
    this.name = "OrganizationGroupManagementError";
  }
}
type DbInput = { db: DrizzleDbClient; actorProfileId: string; organizationId: string };
async function manager(
  repo: ReturnType<typeof createOrganizationGroupManagementRepository>,
  organizationId: string,
  profileId: string,
  lock: boolean,
) {
  const actor = lock
    ? await repo.lockManager(organizationId, profileId)
    : await repo.findManager(organizationId, profileId);
  if (!actor) throw new OrganizationGroupManagementError("forbidden");
  return actor;
}
async function group(
  repo: ReturnType<typeof createOrganizationGroupManagementRepository>,
  organizationId: string,
  groupId: string,
  lock = false,
  includeArchived = false,
) {
  const value = await repo.getGroup(organizationId, groupId, lock);
  if (!value || (!includeArchived && value.archivedAt))
    throw new OrganizationGroupManagementError("not_found");
  return value;
}
export async function listOrganizationGroups(
  input: DbInput & { cursor: string | null; limit: number },
) {
  const repo = createOrganizationGroupManagementRepository(input.db);
  await manager(repo, input.organizationId, input.actorProfileId, false);
  if (input.cursor && !(await repo.hasGroupCursor(input.organizationId, input.cursor)))
    throw new OrganizationGroupManagementError("invalid_cursor");
  const rows = await repo.listGroups(input.organizationId, input.cursor, input.limit + 1);
  const items = rows.slice(0, input.limit);
  return {
    items,
    hasMore: rows.length > input.limit,
    nextCursor: rows.length > input.limit ? (items.at(-1)?.id ?? null) : null,
  };
}
export async function getOrganizationGroup(input: DbInput & { groupId: string }) {
  const repo = createOrganizationGroupManagementRepository(input.db);
  await manager(repo, input.organizationId, input.actorProfileId, false);
  const value = await group(repo, input.organizationId, input.groupId);
  return {
    id: value.id,
    name: value.name,
    description: value.description,
    createdAt: value.createdAt,
  };
}
export async function listOrganizationGroupAthletes(
  input: DbInput & { groupId: string; cursor: string | null; limit: number },
) {
  const repo = createOrganizationGroupManagementRepository(input.db);
  await manager(repo, input.organizationId, input.actorProfileId, false);
  await group(repo, input.organizationId, input.groupId);
  if (
    input.cursor &&
    !(await repo.hasAthleteCursor(input.organizationId, input.groupId, input.cursor))
  )
    throw new OrganizationGroupManagementError("invalid_cursor");
  const rows = await repo.listAthletes(
    input.organizationId,
    input.groupId,
    input.cursor,
    input.limit + 1,
  );
  const items = rows.slice(0, input.limit);
  return {
    items,
    hasMore: rows.length > input.limit,
    nextCursor: rows.length > input.limit ? (items.at(-1)?.id ?? null) : null,
  };
}
export async function listOrganizationGroupCoaches(
  input: DbInput & { groupId: string; cursor: string | null; limit: number },
) {
  const repo = createOrganizationGroupManagementRepository(input.db);
  await manager(repo, input.organizationId, input.actorProfileId, false);
  await group(repo, input.organizationId, input.groupId);
  if (
    input.cursor &&
    !(await repo.hasCoachCursor(input.organizationId, input.groupId, input.cursor))
  )
    throw new OrganizationGroupManagementError("invalid_cursor");
  const rows = await repo.listCoaches(
    input.organizationId,
    input.groupId,
    input.cursor,
    input.limit + 1,
  );
  const items = rows.slice(0, input.limit);
  return {
    items,
    hasMore: rows.length > input.limit,
    nextCursor: rows.length > input.limit ? (items.at(-1)?.id ?? null) : null,
  };
}
export async function createOrganizationGroup(
  input: DbInput & { groupId: string; name: string; description: string | null },
) {
  return input.db.transaction(async (tx) => {
    const repo = createOrganizationGroupManagementRepository(tx);
    const actor = await manager(repo, input.organizationId, input.actorProfileId, true);
    const created = await repo.createGroup({
      id: input.groupId,
      organizationId: input.organizationId,
      name: input.name,
      description: input.description,
      actorMembershipId: actor.membershipId,
    });
    if (created[0]) return { id: input.groupId, status: "created" as const };
    const existing = await group(repo, input.organizationId, input.groupId, true, true);
    if (
      !existing.archivedAt &&
      existing.name === input.name &&
      existing.description === input.description
    )
      return { id: input.groupId, status: "created" as const };
    throw new OrganizationGroupManagementError("conflict");
  });
}
export async function archiveOrganizationGroup(input: DbInput & { groupId: string }) {
  return input.db.transaction(async (tx) => {
    const repo = createOrganizationGroupManagementRepository(tx);
    const actor = await manager(repo, input.organizationId, input.actorProfileId, true);
    const existing = await group(repo, input.organizationId, input.groupId, true, true);
    if (existing.archivedAt) return { id: input.groupId, status: "archived" as const };
    await repo.archiveGroup(input.organizationId, input.groupId, actor.membershipId);
    return { id: input.groupId, status: "archived" as const };
  });
}
async function createLink(
  input: DbInput & { groupId: string; linkId: string; targetId: string; kind: "athlete" | "coach" },
) {
  return input.db.transaction(async (tx) => {
    const repo = createOrganizationGroupManagementRepository(tx);
    const actor = await manager(repo, input.organizationId, input.actorProfileId, true);
    await group(repo, input.organizationId, input.groupId, true);
    const replay =
      input.kind === "athlete"
        ? await repo.getActiveAthleteLink(input.organizationId, input.groupId, input.linkId)
        : await repo.getActiveCoachLink(input.organizationId, input.groupId, input.linkId);
    if (replay) {
      if (("engagementId" in replay ? replay.engagementId : replay.membershipId) === input.targetId)
        return { id: replay.id, status: "active" as const };
      throw new OrganizationGroupManagementError("conflict");
    }
    const valid =
      input.kind === "athlete"
        ? await repo.activeEngagement(input.organizationId, input.targetId)
        : await repo.activeCoach(input.organizationId, input.targetId);
    if (!valid) throw new OrganizationGroupManagementError("not_found");
    const result =
      input.kind === "athlete"
        ? await repo.addAthlete({
            id: input.linkId,
            organizationId: input.organizationId,
            groupId: input.groupId,
            engagementId: input.targetId,
            actorMembershipId: actor.membershipId,
          })
        : await repo.assignCoach({
            id: input.linkId,
            organizationId: input.organizationId,
            groupId: input.groupId,
            membershipId: input.targetId,
            actorMembershipId: actor.membershipId,
          });
    if (result[0]) return { id: input.linkId, status: "active" as const };
    const existing =
      input.kind === "athlete"
        ? await repo.findActiveAthleteLink(input.organizationId, input.groupId, input.targetId)
        : await repo.findActiveCoachLink(input.organizationId, input.groupId, input.targetId);
    if (input.kind === "athlete") {
      if (existing && "engagementId" in existing)
        return { id: existing.id, status: "active" as const };
    } else if (existing && "membershipId" in existing && existing.membershipId === input.targetId)
      return { id: existing.id, status: "active" as const };
    throw new OrganizationGroupManagementError("conflict");
  });
}
export const addOrganizationGroupAthlete = (
  input: DbInput & { groupId: string; linkId: string; engagementId: string },
) => createLink({ ...input, targetId: input.engagementId, kind: "athlete" });
export const assignOrganizationGroupCoach = (
  input: DbInput & { groupId: string; linkId: string; membershipId: string },
) => createLink({ ...input, targetId: input.membershipId, kind: "coach" });
async function endLink(
  input: DbInput & { groupId: string; linkId: string; kind: "athlete" | "coach" },
) {
  return input.db.transaction(async (tx) => {
    const repo = createOrganizationGroupManagementRepository(tx);
    const actor = await manager(repo, input.organizationId, input.actorProfileId, true);
    await group(repo, input.organizationId, input.groupId, true);
    const existing =
      input.kind === "athlete"
        ? await repo.getActiveAthleteLink(input.organizationId, input.groupId, input.linkId)
        : await repo.getActiveCoachLink(input.organizationId, input.groupId, input.linkId);
    if (!existing) return { id: input.linkId, status: "ended" as const };
    if (input.kind === "athlete")
      await repo.endAthlete(input.organizationId, input.groupId, input.linkId, actor.membershipId);
    else await repo.endCoach(input.organizationId, input.groupId, input.linkId, actor.membershipId);
    return { id: input.linkId, status: "ended" as const };
  });
}
export const removeOrganizationGroupAthlete = (
  input: DbInput & { groupId: string; linkId: string },
) => endLink({ ...input, kind: "athlete" });
export const removeOrganizationGroupCoach = (
  input: DbInput & { groupId: string; linkId: string },
) => endLink({ ...input, kind: "coach" });
