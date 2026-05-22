import {
  canRemoveGroupMember,
  canTransferGroupOwnership,
  canUpdateGroupMemberRole,
  createGroupInputSchema,
  GROUP_INVITATION_STATUSES,
  GROUP_JOIN_POLICIES,
  GROUP_JOIN_REQUEST_STATUSES,
  GROUP_MEMBERSHIP_ROLES,
  GROUP_MEMBERSHIP_STATUSES,
  inviteProfilesInputSchema,
  listGroupsInputSchema,
  removeMemberInputSchema,
  reviewJoinRequestInputSchema,
  transferOwnershipInputSchema,
  updateGroupInputSchema,
  updateMemberRoleInputSchema,
} from "@repo/core/groups";
import { groupInvitations, groupJoinRequests, groupMemberships, groups, profiles } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, ilike, inArray, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";
import { getRequiredDb } from "../../db";
import { createTRPCRouter, protectedProcedure } from "../../trpc";
import {
  buildGroupViewerStateForProfile,
  GROUP_INVITATION_STATUS_PENDING,
  GROUP_JOIN_REQUEST_STATUS_PENDING,
  GROUP_MEMBERSHIP_ROLE_OWNER,
  GROUP_MEMBERSHIP_STATUS_ACTIVE,
  getCurrentProfileId,
  getGroupMembership,
  requireGroupAdmin,
  requireGroupMemberListAccess,
  requireGroupOwner,
  requireGroupViewAccess,
} from "./access";
import { groupEventsRouter } from "./events";

const groupIdInputSchema = z.object({ groupId: z.string().uuid("Invalid group ID") });
const invitationIdInputSchema = z.object({
  invitationId: z.string().uuid("Invalid invitation ID"),
});
const joinRequestIdInputSchema = z.object({
  requestId: z.string().uuid("Invalid join request ID"),
});
const groupLookupInputSchema = z
  .object({
    groupId: z.string().uuid("Invalid group ID").optional(),
    slug: z.string().trim().min(1).optional(),
  })
  .refine((input) => Boolean(input.groupId) !== Boolean(input.slug), {
    message: "Provide either groupId or slug",
  });
const groupPageInputSchema = groupIdInputSchema.extend({
  cursor: z.string().min(1).nullable().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});
const profileGroupsInputSchema = listGroupsInputSchema.extend({
  profileId: z.string().uuid("Invalid profile ID"),
});

type GroupRow = typeof groups.$inferSelect;
type MembershipRow = typeof groupMemberships.$inferSelect;
type InvitationRow = typeof groupInvitations.$inferSelect;
type JoinRequestRow = typeof groupJoinRequests.$inferSelect;
type GroupsMutationDb = Pick<ReturnType<typeof getRequiredDb>, "select" | "insert" | "update">;

const GROUP_JOIN_POLICY_OPEN = GROUP_JOIN_POLICIES[0];
const GROUP_JOIN_POLICY_INVITE_ONLY = GROUP_JOIN_POLICIES[2];
const GROUP_MEMBERSHIP_ROLE_MEMBER = GROUP_MEMBERSHIP_ROLES[2];
const GROUP_MEMBERSHIP_STATUS_LEFT = GROUP_MEMBERSHIP_STATUSES[1];
const GROUP_MEMBERSHIP_STATUS_REMOVED = GROUP_MEMBERSHIP_STATUSES[2];
const GROUP_INVITATION_STATUS_ACCEPTED = GROUP_INVITATION_STATUSES[1];
const GROUP_INVITATION_STATUS_DECLINED = GROUP_INVITATION_STATUSES[2];
const GROUP_INVITATION_STATUS_REVOKED = GROUP_INVITATION_STATUSES[3];
const GROUP_JOIN_REQUEST_STATUS_APPROVED = GROUP_JOIN_REQUEST_STATUSES[1];
const GROUP_JOIN_REQUEST_STATUS_DECLINED = GROUP_JOIN_REQUEST_STATUSES[2];
const GROUP_JOIN_REQUEST_STATUS_CANCELLED = GROUP_JOIN_REQUEST_STATUSES[3];

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function serializeGroupBasics(group: GroupRow, input: { includePrivateContent?: boolean } = {}) {
  const canShowPrivateContent =
    group.access_level !== "members_only" || input.includePrivateContent;

  return {
    id: group.id,
    name: group.name,
    slug: group.slug,
    description: canShowPrivateContent ? group.description : null,
    avatar_url: group.avatar_url,
    cover_url: canShowPrivateContent ? group.cover_url : null,
    access_level: group.access_level,
    join_policy:
      group.join_policy === "request_to_join" ? GROUP_JOIN_POLICY_INVITE_ONLY : group.join_policy,
    created_at: toIsoString(group.created_at),
    updated_at: toIsoString(group.updated_at),
  };
}

function serializeGroupDetail(group: GroupRow) {
  return {
    ...serializeGroupBasics(group, { includePrivateContent: true }),
    created_by_profile_id: group.created_by_profile_id,
  };
}

function serializeMembership(membership: MembershipRow) {
  return {
    group_id: membership.group_id,
    profile_id: membership.profile_id,
    role: membership.role,
    status: membership.status,
    created_at: toIsoString(membership.created_at),
    updated_at: toIsoString(membership.updated_at),
  };
}

function serializeInvitation(invitation: InvitationRow) {
  return {
    id: invitation.id,
    group_id: invitation.group_id,
    invited_profile_id: invitation.invited_profile_id,
    status: invitation.status,
    expires_at: invitation.expires_at ? toIsoString(invitation.expires_at) : null,
    created_at: toIsoString(invitation.created_at),
    updated_at: toIsoString(invitation.updated_at),
  };
}

function serializeJoinRequest(joinRequest: JoinRequestRow) {
  return {
    id: joinRequest.id,
    group_id: joinRequest.group_id,
    profile_id: joinRequest.profile_id,
    status: joinRequest.status,
    created_at: toIsoString(joinRequest.created_at),
    updated_at: toIsoString(joinRequest.updated_at),
  };
}

function slugifyGroupName(name: string) {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "group";
}

async function generateUniqueActiveGroupSlug(db: ReturnType<typeof getRequiredDb>, name: string) {
  const baseSlug = slugifyGroupName(name);

  for (let attempt = 1; attempt <= 100; attempt += 1) {
    const slug = attempt === 1 ? baseSlug : `${baseSlug}-${attempt}`;
    const [existing] = await db
      .select({ id: groups.id })
      .from(groups)
      .where(and(eq(groups.slug, slug), isNull(groups.deleted_at)))
      .limit(1);

    if (!existing) return slug;
  }

  throw new TRPCError({
    code: "CONFLICT",
    message: "Could not generate a unique group slug",
  });
}

async function getActiveOwnerCount(db: GroupsMutationDb, groupId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(groupMemberships)
    .where(
      and(
        eq(groupMemberships.group_id, groupId),
        eq(groupMemberships.role, GROUP_MEMBERSHIP_ROLE_OWNER),
        eq(groupMemberships.status, GROUP_MEMBERSHIP_STATUS_ACTIVE),
      ),
    );

  return row?.value ?? 0;
}

async function setMembershipActive(
  db: GroupsMutationDb,
  input: {
    groupId: string;
    profileId: string;
    role?: typeof GROUP_MEMBERSHIP_ROLE_MEMBER | typeof GROUP_MEMBERSHIP_ROLE_OWNER;
  },
) {
  const role = input.role ?? GROUP_MEMBERSHIP_ROLE_MEMBER;
  const now = new Date();
  const [membership] = await db
    .select()
    .from(groupMemberships)
    .where(
      and(
        eq(groupMemberships.group_id, input.groupId),
        eq(groupMemberships.profile_id, input.profileId),
      ),
    )
    .limit(1);

  if (membership) {
    const [updated] = await db
      .update(groupMemberships)
      .set({ role, status: GROUP_MEMBERSHIP_STATUS_ACTIVE, updated_at: now })
      .where(
        and(
          eq(groupMemberships.group_id, input.groupId),
          eq(groupMemberships.profile_id, input.profileId),
        ),
      )
      .returning();

    return updated as MembershipRow;
  }

  const [created] = await db
    .insert(groupMemberships)
    .values({
      group_id: input.groupId,
      profile_id: input.profileId,
      role,
      status: GROUP_MEMBERSHIP_STATUS_ACTIVE,
    })
    .returning();

  return created as MembershipRow;
}

function pageResult<T>(items: T[], limit: number, getCursor: (item: T) => string) {
  const hasMore = items.length > limit;
  const visibleItems = hasMore ? items.slice(0, limit) : items;

  return {
    items: visibleItems,
    nextCursor:
      hasMore && visibleItems.length > 0
        ? getCursor(visibleItems[visibleItems.length - 1] as T)
        : null,
  };
}

async function getGroupCursorFilter(db: ReturnType<typeof getRequiredDb>, cursor?: string | null) {
  if (!cursor) return undefined;

  const [cursorGroup] = await db
    .select({ id: groups.id, created_at: groups.created_at })
    .from(groups)
    .where(and(eq(groups.id, cursor), isNull(groups.deleted_at)))
    .limit(1);

  if (!cursorGroup) return undefined;

  return or(
    lt(groups.created_at, cursorGroup.created_at),
    and(eq(groups.created_at, cursorGroup.created_at), lt(groups.id, cursorGroup.id)),
  );
}

async function getMembershipCursorFilter(
  db: ReturnType<typeof getRequiredDb>,
  groupId: string,
  cursor?: string | null,
) {
  if (!cursor) return undefined;

  const [cursorMembership] = await db
    .select({ profile_id: groupMemberships.profile_id, created_at: groupMemberships.created_at })
    .from(groupMemberships)
    .where(and(eq(groupMemberships.group_id, groupId), eq(groupMemberships.profile_id, cursor)))
    .limit(1);

  if (!cursorMembership) return undefined;

  return or(
    lt(groupMemberships.created_at, cursorMembership.created_at),
    and(
      eq(groupMemberships.created_at, cursorMembership.created_at),
      lt(groupMemberships.profile_id, cursorMembership.profile_id),
    ),
  );
}

async function getInvitationCursorFilter(
  db: ReturnType<typeof getRequiredDb>,
  cursor?: string | null,
) {
  if (!cursor) return undefined;

  const [cursorInvitation] = await db
    .select({ id: groupInvitations.id, created_at: groupInvitations.created_at })
    .from(groupInvitations)
    .where(eq(groupInvitations.id, cursor))
    .limit(1);

  if (!cursorInvitation) return undefined;

  return or(
    lt(groupInvitations.created_at, cursorInvitation.created_at),
    and(
      eq(groupInvitations.created_at, cursorInvitation.created_at),
      lt(groupInvitations.id, cursorInvitation.id),
    ),
  );
}

async function getJoinRequestCursorFilter(
  db: ReturnType<typeof getRequiredDb>,
  cursor?: string | null,
) {
  if (!cursor) return undefined;

  const [cursorJoinRequest] = await db
    .select({ id: groupJoinRequests.id, created_at: groupJoinRequests.created_at })
    .from(groupJoinRequests)
    .where(eq(groupJoinRequests.id, cursor))
    .limit(1);

  if (!cursorJoinRequest) return undefined;

  return or(
    lt(groupJoinRequests.created_at, cursorJoinRequest.created_at),
    and(
      eq(groupJoinRequests.created_at, cursorJoinRequest.created_at),
      lt(groupJoinRequests.id, cursorJoinRequest.id),
    ),
  );
}

async function getGroupByLookup(
  db: ReturnType<typeof getRequiredDb>,
  input: z.infer<typeof groupLookupInputSchema>,
) {
  const [group] = await db
    .select()
    .from(groups)
    .where(
      and(
        input.groupId ? eq(groups.id, input.groupId) : eq(groups.slug, input.slug as string),
        isNull(groups.deleted_at),
      ),
    )
    .limit(1);

  if (!group) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Group not found" });
  }

  return group;
}

export const groupsRouter = createTRPCRouter({
  events: groupEventsRouter,

  create: protectedProcedure.input(createGroupInputSchema).mutation(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);
    const profileId = await getCurrentProfileId(db, ctx.session.user.id);
    const slug = await generateUniqueActiveGroupSlug(db, input.name);

    const group = await db.transaction(async (tx) => {
      const [createdGroup] = await tx
        .insert(groups)
        .values({
          created_by_profile_id: profileId,
          name: input.name,
          slug,
          description: input.description ?? null,
          avatar_url: input.avatar_url ?? null,
          cover_url: input.cover_url ?? null,
          access_level: input.access_level,
          join_policy: input.join_policy,
        })
        .returning();

      if (!createdGroup) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Group could not be created" });
      }

      await tx.insert(groupMemberships).values({
        group_id: createdGroup.id,
        profile_id: profileId,
        role: GROUP_MEMBERSHIP_ROLE_OWNER,
        status: GROUP_MEMBERSHIP_STATUS_ACTIVE,
      });

      return createdGroup;
    });

    return { group: serializeGroupDetail(group) };
  }),

  update: protectedProcedure.input(updateGroupInputSchema).mutation(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);
    const profileId = await getCurrentProfileId(db, ctx.session.user.id);
    await getGroupByLookup(db, { groupId: input.groupId });
    await requireGroupAdmin(db, input.groupId, profileId);

    const [group] = await db
      .update(groups)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description ?? null } : {}),
        ...(input.avatar_url !== undefined ? { avatar_url: input.avatar_url ?? null } : {}),
        ...(input.cover_url !== undefined ? { cover_url: input.cover_url ?? null } : {}),
        ...(input.access_level !== undefined ? { access_level: input.access_level } : {}),
        ...(input.join_policy !== undefined ? { join_policy: input.join_policy } : {}),
        updated_at: new Date(),
      })
      .where(and(eq(groups.id, input.groupId), isNull(groups.deleted_at)))
      .returning();

    if (!group) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Group not found" });
    }

    return { group: serializeGroupDetail(group) };
  }),

  delete: protectedProcedure.input(groupIdInputSchema).mutation(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);
    const profileId = await getCurrentProfileId(db, ctx.session.user.id);
    await getGroupByLookup(db, { groupId: input.groupId });
    await requireGroupOwner(db, input.groupId, profileId);

    await db.transaction(async (tx) => {
      const now = new Date();
      await tx
        .update(groups)
        .set({ deleted_at: now, updated_at: now })
        .where(and(eq(groups.id, input.groupId), isNull(groups.deleted_at)));
      await tx
        .update(groupInvitations)
        .set({ status: GROUP_INVITATION_STATUS_REVOKED, updated_at: now })
        .where(
          and(
            eq(groupInvitations.group_id, input.groupId),
            eq(groupInvitations.status, GROUP_INVITATION_STATUS_PENDING),
          ),
        );
      await tx
        .update(groupJoinRequests)
        .set({ status: GROUP_JOIN_REQUEST_STATUS_CANCELLED, updated_at: now })
        .where(
          and(
            eq(groupJoinRequests.group_id, input.groupId),
            eq(groupJoinRequests.status, GROUP_JOIN_REQUEST_STATUS_PENDING),
          ),
        );
    });

    return { success: true };
  }),

  join: protectedProcedure.input(groupIdInputSchema).mutation(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);
    const profileId = await getCurrentProfileId(db, ctx.session.user.id);
    const group = await getGroupByLookup(db, { groupId: input.groupId });

    if (group.join_policy !== GROUP_JOIN_POLICY_OPEN) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "This group is not open to join" });
    }

    const membership = await getGroupMembership(db, input.groupId, profileId);
    if (membership.status === GROUP_MEMBERSHIP_STATUS_REMOVED) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You cannot automatically rejoin this group",
      });
    }
    if (membership.status === GROUP_MEMBERSHIP_STATUS_ACTIVE) {
      const [activeMembership] = await db
        .select()
        .from(groupMemberships)
        .where(
          and(
            eq(groupMemberships.group_id, input.groupId),
            eq(groupMemberships.profile_id, profileId),
          ),
        )
        .limit(1);
      return { membership: serializeMembership(activeMembership as MembershipRow) };
    }

    const updatedMembership = await setMembershipActive(db, { groupId: input.groupId, profileId });
    return { membership: serializeMembership(updatedMembership) };
  }),

  leave: protectedProcedure.input(groupIdInputSchema).mutation(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);
    const profileId = await getCurrentProfileId(db, ctx.session.user.id);
    await getGroupByLookup(db, { groupId: input.groupId });
    const membership = await getGroupMembership(db, input.groupId, profileId);

    if (membership.status !== GROUP_MEMBERSHIP_STATUS_ACTIVE) {
      return { success: true };
    }

    if (
      membership.role === GROUP_MEMBERSHIP_ROLE_OWNER &&
      (await getActiveOwnerCount(db, input.groupId)) <= 1
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "The sole owner cannot leave the group",
      });
    }

    await db
      .update(groupMemberships)
      .set({ status: GROUP_MEMBERSHIP_STATUS_LEFT, updated_at: new Date() })
      .where(
        and(
          eq(groupMemberships.group_id, input.groupId),
          eq(groupMemberships.profile_id, profileId),
        ),
      );

    return { success: true };
  }),

  requestToJoin: protectedProcedure.input(groupIdInputSchema).mutation(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);
    const profileId = await getCurrentProfileId(db, ctx.session.user.id);
    const group = await getGroupByLookup(db, { groupId: input.groupId });

    if (group.join_policy === GROUP_JOIN_POLICY_OPEN) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "This group is open to join directly" });
    }

    const membership = await getGroupMembership(db, input.groupId, profileId);
    if (membership.status === GROUP_MEMBERSHIP_STATUS_ACTIVE) {
      throw new TRPCError({ code: "CONFLICT", message: "You are already a member of this group" });
    }

    const [existingRequest] = await db
      .select()
      .from(groupJoinRequests)
      .where(
        and(
          eq(groupJoinRequests.group_id, input.groupId),
          eq(groupJoinRequests.profile_id, profileId),
          eq(groupJoinRequests.status, GROUP_JOIN_REQUEST_STATUS_PENDING),
        ),
      )
      .limit(1);

    if (existingRequest) {
      return { joinRequest: serializeJoinRequest(existingRequest) };
    }

    const [joinRequest] = await db
      .insert(groupJoinRequests)
      .values({
        group_id: input.groupId,
        profile_id: profileId,
        status: GROUP_JOIN_REQUEST_STATUS_PENDING,
      })
      .returning();

    return { joinRequest: serializeJoinRequest(joinRequest as JoinRequestRow) };
  }),

  cancelJoinRequest: protectedProcedure
    .input(joinRequestIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const profileId = await getCurrentProfileId(db, ctx.session.user.id);
      const [joinRequest] = await db
        .select({ request: groupJoinRequests, group: groups })
        .from(groupJoinRequests)
        .innerJoin(groups, eq(groups.id, groupJoinRequests.group_id))
        .where(and(eq(groupJoinRequests.id, input.requestId), isNull(groups.deleted_at)))
        .limit(1);

      if (!joinRequest) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Join request not found" });
      }
      if (joinRequest.request.profile_id !== profileId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You cannot cancel this join request" });
      }
      if (joinRequest.request.status !== GROUP_JOIN_REQUEST_STATUS_PENDING) {
        return { joinRequest: serializeJoinRequest(joinRequest.request) };
      }

      const [updated] = await db
        .update(groupJoinRequests)
        .set({ status: GROUP_JOIN_REQUEST_STATUS_CANCELLED, updated_at: new Date() })
        .where(eq(groupJoinRequests.id, input.requestId))
        .returning();

      return { joinRequest: serializeJoinRequest(updated as JoinRequestRow) };
    }),

  reviewJoinRequest: protectedProcedure
    .input(reviewJoinRequestInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const profileId = await getCurrentProfileId(db, ctx.session.user.id);
      const [row] = await db
        .select({ request: groupJoinRequests, group: groups })
        .from(groupJoinRequests)
        .innerJoin(groups, eq(groups.id, groupJoinRequests.group_id))
        .where(and(eq(groupJoinRequests.id, input.requestId), isNull(groups.deleted_at)))
        .limit(1);

      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Join request not found" });
      }
      await requireGroupAdmin(db, row.request.group_id, profileId);
      if (row.request.status !== GROUP_JOIN_REQUEST_STATUS_PENDING) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Join request has already been reviewed",
        });
      }

      const result = await db.transaction(async (tx) => {
        const now = new Date();
        const status =
          input.decision === "approve"
            ? GROUP_JOIN_REQUEST_STATUS_APPROVED
            : GROUP_JOIN_REQUEST_STATUS_DECLINED;
        const [updatedRequest] = await tx
          .update(groupJoinRequests)
          .set({ status, updated_at: now })
          .where(eq(groupJoinRequests.id, input.requestId))
          .returning();
        const membership =
          input.decision === "approve"
            ? await setMembershipActive(tx, {
                groupId: row.request.group_id,
                profileId: row.request.profile_id,
              })
            : null;

        return { joinRequest: updatedRequest as JoinRequestRow, membership };
      });

      return {
        joinRequest: serializeJoinRequest(result.joinRequest),
        membership: result.membership ? serializeMembership(result.membership) : null,
      };
    }),

  inviteProfiles: protectedProcedure
    .input(inviteProfilesInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const profileId = await getCurrentProfileId(db, ctx.session.user.id);
      await getGroupByLookup(db, { groupId: input.groupId });
      await requireGroupAdmin(db, input.groupId, profileId);

      const targetProfileIds = [...new Set(input.profileIds)];
      const existingProfiles = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(inArray(profiles.id, targetProfileIds));
      if (existingProfiles.length !== targetProfileIds.length) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "One or more invited profiles were not found",
        });
      }

      const invitations = await db.transaction(async (tx) => {
        const rows: InvitationRow[] = [];
        for (const invitedProfileId of targetProfileIds) {
          const membership = await getGroupMembership(tx, input.groupId, invitedProfileId);
          if (membership.status === GROUP_MEMBERSHIP_STATUS_ACTIVE) continue;

          const [existingInvite] = await tx
            .select()
            .from(groupInvitations)
            .where(
              and(
                eq(groupInvitations.group_id, input.groupId),
                eq(groupInvitations.invited_profile_id, invitedProfileId),
                eq(groupInvitations.status, GROUP_INVITATION_STATUS_PENDING),
              ),
            )
            .limit(1);

          if (existingInvite) {
            rows.push(existingInvite);
            continue;
          }

          const [createdInvite] = await tx
            .insert(groupInvitations)
            .values({
              group_id: input.groupId,
              invited_profile_id: invitedProfileId,
              status: GROUP_INVITATION_STATUS_PENDING,
            })
            .returning();
          rows.push(createdInvite as InvitationRow);
        }
        return rows;
      });

      return { invitations: invitations.map(serializeInvitation) };
    }),

  acceptInvite: protectedProcedure
    .input(invitationIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const profileId = await getCurrentProfileId(db, ctx.session.user.id);
      const [row] = await db
        .select({ invitation: groupInvitations, group: groups })
        .from(groupInvitations)
        .innerJoin(groups, eq(groups.id, groupInvitations.group_id))
        .where(and(eq(groupInvitations.id, input.invitationId), isNull(groups.deleted_at)))
        .limit(1);

      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found" });
      }
      if (row.invitation.invited_profile_id !== profileId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You cannot accept this invitation" });
      }
      if (row.invitation.status !== GROUP_INVITATION_STATUS_PENDING) {
        throw new TRPCError({ code: "CONFLICT", message: "Invitation is no longer pending" });
      }

      const result = await db.transaction(async (tx) => {
        const membership = await setMembershipActive(tx, {
          groupId: row.invitation.group_id,
          profileId,
        });
        const [invitation] = await tx
          .update(groupInvitations)
          .set({ status: GROUP_INVITATION_STATUS_ACCEPTED, updated_at: new Date() })
          .where(eq(groupInvitations.id, input.invitationId))
          .returning();
        return { invitation: invitation as InvitationRow, membership };
      });

      return {
        invitation: serializeInvitation(result.invitation),
        membership: serializeMembership(result.membership),
      };
    }),

  declineInvite: protectedProcedure
    .input(invitationIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const profileId = await getCurrentProfileId(db, ctx.session.user.id);
      const [row] = await db
        .select({ invitation: groupInvitations, group: groups })
        .from(groupInvitations)
        .innerJoin(groups, eq(groups.id, groupInvitations.group_id))
        .where(and(eq(groupInvitations.id, input.invitationId), isNull(groups.deleted_at)))
        .limit(1);

      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found" });
      if (row.invitation.invited_profile_id !== profileId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You cannot decline this invitation" });
      }
      if (row.invitation.status !== GROUP_INVITATION_STATUS_PENDING) {
        return { invitation: serializeInvitation(row.invitation) };
      }

      const [invitation] = await db
        .update(groupInvitations)
        .set({ status: GROUP_INVITATION_STATUS_DECLINED, updated_at: new Date() })
        .where(eq(groupInvitations.id, input.invitationId))
        .returning();
      return { invitation: serializeInvitation(invitation as InvitationRow) };
    }),

  revokeInvite: protectedProcedure
    .input(invitationIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const profileId = await getCurrentProfileId(db, ctx.session.user.id);
      const [row] = await db
        .select({ invitation: groupInvitations, group: groups })
        .from(groupInvitations)
        .innerJoin(groups, eq(groups.id, groupInvitations.group_id))
        .where(and(eq(groupInvitations.id, input.invitationId), isNull(groups.deleted_at)))
        .limit(1);

      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found" });
      await requireGroupAdmin(db, row.invitation.group_id, profileId);
      if (row.invitation.status !== GROUP_INVITATION_STATUS_PENDING) {
        return { invitation: serializeInvitation(row.invitation) };
      }

      const [invitation] = await db
        .update(groupInvitations)
        .set({ status: GROUP_INVITATION_STATUS_REVOKED, updated_at: new Date() })
        .where(eq(groupInvitations.id, input.invitationId))
        .returning();
      return { invitation: serializeInvitation(invitation as InvitationRow) };
    }),

  updateMemberRole: protectedProcedure
    .input(updateMemberRoleInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const profileId = await getCurrentProfileId(db, ctx.session.user.id);
      await getGroupByLookup(db, { groupId: input.groupId });
      const viewer = await requireGroupOwner(db, input.groupId, profileId);
      const target = await getGroupMembership(db, input.groupId, input.profileId);

      if (!canUpdateGroupMemberRole({ viewer, target, nextRole: input.role })) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You cannot update this member role" });
      }

      const [membership] = await db
        .update(groupMemberships)
        .set({ role: input.role, updated_at: new Date() })
        .where(
          and(
            eq(groupMemberships.group_id, input.groupId),
            eq(groupMemberships.profile_id, input.profileId),
          ),
        )
        .returning();

      return { membership: serializeMembership(membership as MembershipRow) };
    }),

  removeMember: protectedProcedure
    .input(removeMemberInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const profileId = await getCurrentProfileId(db, ctx.session.user.id);
      await getGroupByLookup(db, { groupId: input.groupId });
      const viewer = await getGroupMembership(db, input.groupId, profileId);
      const target = await getGroupMembership(db, input.groupId, input.profileId);

      if (!canRemoveGroupMember({ viewer, target })) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You cannot remove this group member" });
      }

      const [membership] = await db
        .update(groupMemberships)
        .set({ status: GROUP_MEMBERSHIP_STATUS_REMOVED, updated_at: new Date() })
        .where(
          and(
            eq(groupMemberships.group_id, input.groupId),
            eq(groupMemberships.profile_id, input.profileId),
          ),
        )
        .returning();

      return { membership: serializeMembership(membership as MembershipRow) };
    }),

  transferOwnership: protectedProcedure
    .input(transferOwnershipInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const profileId = await getCurrentProfileId(db, ctx.session.user.id);
      await getGroupByLookup(db, { groupId: input.groupId });
      const viewer = await requireGroupOwner(db, input.groupId, profileId);
      const target = await getGroupMembership(db, input.groupId, input.targetProfileId);

      if (profileId === input.targetProfileId || !canTransferGroupOwnership({ viewer, target })) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You cannot transfer ownership to this profile",
        });
      }

      const [targetMembership] = await db.transaction(async (tx) => {
        const now = new Date();
        await tx
          .update(groupMemberships)
          .set({ role: input.previousOwnerRole, updated_at: now })
          .where(
            and(
              eq(groupMemberships.group_id, input.groupId),
              eq(groupMemberships.profile_id, profileId),
              eq(groupMemberships.role, GROUP_MEMBERSHIP_ROLE_OWNER),
              eq(groupMemberships.status, GROUP_MEMBERSHIP_STATUS_ACTIVE),
            ),
          );

        return tx
          .update(groupMemberships)
          .set({
            role: GROUP_MEMBERSHIP_ROLE_OWNER,
            status: GROUP_MEMBERSHIP_STATUS_ACTIVE,
            updated_at: now,
          })
          .where(
            and(
              eq(groupMemberships.group_id, input.groupId),
              eq(groupMemberships.profile_id, input.targetProfileId),
            ),
          )
          .returning();
      });

      return { membership: serializeMembership(targetMembership as MembershipRow) };
    }),

  listDiscoverable: protectedProcedure
    .input(listGroupsInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      await getCurrentProfileId(db, ctx.session.user.id);
      const cursorFilter = await getGroupCursorFilter(db, input.cursor);
      const searchFilter = input.search
        ? or(
            ilike(groups.name, `%${input.search}%`),
            ilike(groups.description, `%${input.search}%`),
          )
        : undefined;

      const rows = await db
        .select()
        .from(groups)
        .where(and(isNull(groups.deleted_at), searchFilter, cursorFilter))
        .orderBy(desc(groups.created_at), desc(groups.id))
        .limit(input.limit + 1);

      return pageResult(
        rows.map((group) => serializeGroupBasics(group)),
        input.limit,
        (group) => group.id,
      );
    }),

  myGroups: protectedProcedure.input(listGroupsInputSchema).query(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);
    const profileId = await getCurrentProfileId(db, ctx.session.user.id);
    const cursorFilter = await getGroupCursorFilter(db, input.cursor);
    const rows = await db
      .select({ group: groups, membership: groupMemberships })
      .from(groupMemberships)
      .innerJoin(groups, eq(groups.id, groupMemberships.group_id))
      .where(
        and(
          eq(groupMemberships.profile_id, profileId),
          eq(groupMemberships.status, GROUP_MEMBERSHIP_STATUS_ACTIVE),
          isNull(groups.deleted_at),
          cursorFilter,
        ),
      )
      .orderBy(desc(groups.created_at), desc(groups.id))
      .limit(input.limit + 1);

    return pageResult(
      rows.map(({ group, membership }) => ({
        ...serializeGroupBasics(group, { includePrivateContent: true }),
        viewerMembershipRole: membership.role,
      })),
      input.limit,
      (group) => group.id,
    );
  }),

  forProfile: protectedProcedure.input(profileGroupsInputSchema).query(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);
    await getCurrentProfileId(db, ctx.session.user.id);
    const cursorFilter = await getGroupCursorFilter(db, input.cursor);
    const searchFilter = input.search
      ? or(ilike(groups.name, `%${input.search}%`), ilike(groups.description, `%${input.search}%`))
      : undefined;

    const rows = await db
      .select({ group: groups })
      .from(groupMemberships)
      .innerJoin(groups, eq(groups.id, groupMemberships.group_id))
      .where(
        and(
          eq(groupMemberships.profile_id, input.profileId),
          eq(groupMemberships.status, GROUP_MEMBERSHIP_STATUS_ACTIVE),
          isNull(groups.deleted_at),
          searchFilter,
          cursorFilter,
        ),
      )
      .orderBy(desc(groups.created_at), desc(groups.id))
      .limit(input.limit + 1);

    return pageResult(
      rows.map(({ group }) => serializeGroupBasics(group)),
      input.limit,
      (group) => group.id,
    );
  }),

  detail: protectedProcedure.input(groupLookupInputSchema).query(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);
    const profileId = await getCurrentProfileId(db, ctx.session.user.id);
    const group = await getGroupByLookup(db, input);
    const viewer = await buildGroupViewerStateForProfile(db, {
      groupId: group.id,
      profileId,
      accessLevel: group.access_level,
      joinPolicy: group.join_policy,
    });

    return {
      group: viewer.canViewFullGroup ? serializeGroupDetail(group) : serializeGroupBasics(group),
      viewer,
    };
  }),

  members: protectedProcedure.input(groupPageInputSchema).query(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);
    const profileId = await getCurrentProfileId(db, ctx.session.user.id);
    const group = await getGroupByLookup(db, { groupId: input.groupId });
    await requireGroupMemberListAccess(db, {
      groupId: group.id,
      profileId,
      accessLevel: group.access_level,
      joinPolicy: group.join_policy,
    });
    const cursorFilter = await getMembershipCursorFilter(db, group.id, input.cursor);

    const rows = await db
      .select({
        group_id: groupMemberships.group_id,
        profile_id: groupMemberships.profile_id,
        role: groupMemberships.role,
        created_at: groupMemberships.created_at,
        profile_username: profiles.username,
        profile_avatar_url: profiles.avatar_url,
      })
      .from(groupMemberships)
      .innerJoin(profiles, eq(profiles.id, groupMemberships.profile_id))
      .where(
        and(
          eq(groupMemberships.group_id, group.id),
          eq(groupMemberships.status, GROUP_MEMBERSHIP_STATUS_ACTIVE),
          cursorFilter,
        ),
      )
      .orderBy(desc(groupMemberships.created_at), desc(groupMemberships.profile_id))
      .limit(input.limit + 1);

    return pageResult(
      rows.map((row) => ({
        group_id: row.group_id,
        profile_id: row.profile_id,
        role: row.role,
        created_at: toIsoString(row.created_at),
        profile: {
          id: row.profile_id,
          username: row.profile_username,
          avatar_url: row.profile_avatar_url,
        },
      })),
      input.limit,
      (member) => member.profile_id,
    );
  }),

  pendingInvitations: protectedProcedure
    .input(groupPageInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const profileId = await getCurrentProfileId(db, ctx.session.user.id);
      await getGroupByLookup(db, { groupId: input.groupId });
      await requireGroupAdmin(db, input.groupId, profileId);
      const cursorFilter = await getInvitationCursorFilter(db, input.cursor);

      const rows = await db
        .select({
          id: groupInvitations.id,
          group_id: groupInvitations.group_id,
          invited_profile_id: groupInvitations.invited_profile_id,
          expires_at: groupInvitations.expires_at,
          created_at: groupInvitations.created_at,
          profile_username: profiles.username,
          profile_avatar_url: profiles.avatar_url,
        })
        .from(groupInvitations)
        .innerJoin(profiles, eq(profiles.id, groupInvitations.invited_profile_id))
        .where(
          and(
            eq(groupInvitations.group_id, input.groupId),
            eq(groupInvitations.status, GROUP_INVITATION_STATUS_PENDING),
            cursorFilter,
          ),
        )
        .orderBy(desc(groupInvitations.created_at), desc(groupInvitations.id))
        .limit(input.limit + 1);

      return pageResult(
        rows.map((row) => ({
          id: row.id,
          group_id: row.group_id,
          invited_profile_id: row.invited_profile_id,
          status: GROUP_INVITATION_STATUS_PENDING,
          expires_at: row.expires_at ? toIsoString(row.expires_at) : null,
          created_at: toIsoString(row.created_at),
          invited_profile: {
            id: row.invited_profile_id,
            username: row.profile_username,
            avatar_url: row.profile_avatar_url,
          },
        })),
        input.limit,
        (invitation) => invitation.id,
      );
    }),

  myInvitations: protectedProcedure.input(listGroupsInputSchema).query(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);
    const profileId = await getCurrentProfileId(db, ctx.session.user.id);
    const cursorFilter = await getInvitationCursorFilter(db, input.cursor);
    const rows = await db
      .select({ invitation: groupInvitations, group: groups })
      .from(groupInvitations)
      .innerJoin(groups, eq(groups.id, groupInvitations.group_id))
      .where(
        and(
          eq(groupInvitations.invited_profile_id, profileId),
          eq(groupInvitations.status, GROUP_INVITATION_STATUS_PENDING),
          isNull(groups.deleted_at),
          cursorFilter,
        ),
      )
      .orderBy(desc(groupInvitations.created_at), desc(groupInvitations.id))
      .limit(input.limit + 1);

    return pageResult(
      rows.map(({ invitation, group }) => ({
        id: invitation.id,
        group_id: invitation.group_id,
        status: invitation.status,
        expires_at: invitation.expires_at ? toIsoString(invitation.expires_at) : null,
        created_at: toIsoString(invitation.created_at),
        group: serializeGroupBasics(group),
      })),
      input.limit,
      (invitation) => invitation.id,
    );
  }),

  pendingJoinRequests: protectedProcedure
    .input(groupPageInputSchema)
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const profileId = await getCurrentProfileId(db, ctx.session.user.id);
      await getGroupByLookup(db, { groupId: input.groupId });
      await requireGroupAdmin(db, input.groupId, profileId);
      const cursorFilter = await getJoinRequestCursorFilter(db, input.cursor);

      const rows = await db
        .select({
          id: groupJoinRequests.id,
          group_id: groupJoinRequests.group_id,
          profile_id: groupJoinRequests.profile_id,
          created_at: groupJoinRequests.created_at,
          profile_username: profiles.username,
          profile_avatar_url: profiles.avatar_url,
        })
        .from(groupJoinRequests)
        .innerJoin(profiles, eq(profiles.id, groupJoinRequests.profile_id))
        .where(
          and(
            eq(groupJoinRequests.group_id, input.groupId),
            eq(groupJoinRequests.status, GROUP_JOIN_REQUEST_STATUS_PENDING),
            cursorFilter,
          ),
        )
        .orderBy(desc(groupJoinRequests.created_at), desc(groupJoinRequests.id))
        .limit(input.limit + 1);

      return pageResult(
        rows.map((row) => ({
          id: row.id,
          group_id: row.group_id,
          profile_id: row.profile_id,
          status: GROUP_JOIN_REQUEST_STATUS_PENDING,
          created_at: toIsoString(row.created_at),
          profile: {
            id: row.profile_id,
            username: row.profile_username,
            avatar_url: row.profile_avatar_url,
          },
        })),
        input.limit,
        (joinRequest) => joinRequest.id,
      );
    }),
});

export { requireGroupAdmin, requireGroupOwner, requireGroupViewAccess } from "./access";
