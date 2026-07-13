import { TRPCError } from "@trpc/server";
import type { getRequiredDb } from "../../db";
import {
  createFollowNotification,
  createFollowRelationshipIfAbsent,
  deleteFollowRequestNotification,
  removeFollowRelationship,
  transitionFollowRequest,
} from "../../repositories/social-follow-repository";

type DbClient = ReturnType<typeof getRequiredDb>;

export async function followUser({
  db,
  viewerId,
  targetUserId,
}: {
  db: DbClient;
  viewerId: string;
  targetUserId: string;
}) {
  if (viewerId === targetUserId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot follow yourself" });
  }
  const result = await createFollowRelationshipIfAbsent(db, viewerId, targetUserId);
  if (result.kind === "missing_profile") {
    throw new TRPCError({ code: "NOT_FOUND", message: "Target user not found" });
  }
  if (!result.created) {
    return result.follow.status === "accepted"
      ? { ...result.follow, already_following: true }
      : { ...result.follow, already_pending: true };
  }
  if (result.follow.status === "pending") {
    try {
      await createFollowNotification(db, targetUserId, viewerId, "follow_request");
    } catch (error) {
      console.error("Failed to create follow request notification:", error);
    }
  }
  return result.follow;
}

export async function unfollowUser(db: DbClient, viewerId: string, targetUserId: string) {
  await removeFollowRelationship(db, viewerId, targetUserId);
  return { success: true };
}

export async function acceptFollowRequest(db: DbClient, viewerId: string, followerId: string) {
  const result = await transitionFollowRequest(db, viewerId, followerId, "accept");
  if (result === "missing") {
    try {
      await deleteFollowRequestNotification(db, viewerId, followerId);
    } catch (error) {
      console.error("Failed to delete orphan notification:", error);
    }
    return { success: true, message: "No pending request found - notification cleaned up" };
  }
  if (result === "already_accepted") {
    await deleteFollowRequestNotification(db, viewerId, followerId);
    return { success: true, message: "Already following" };
  }
  if (result === "accepted") {
    try {
      await createFollowNotification(db, followerId, viewerId, "new_follower");
    } catch (error) {
      console.error("Failed to create follow accepted notification:", error);
    }
  }
  return { success: true };
}

export async function rejectFollowRequest(db: DbClient, viewerId: string, followerId: string) {
  const result = await transitionFollowRequest(db, viewerId, followerId, "reject");
  if (result === "missing") {
    try {
      await deleteFollowRequestNotification(db, viewerId, followerId);
    } catch (error) {
      console.error("Failed to delete orphan notification:", error);
    }
    return { success: true, message: "No pending request found - notification cleaned up" };
  }
  if (result === "already_accepted") {
    await deleteFollowRequestNotification(db, viewerId, followerId);
    return { success: true, message: "Follow request already processed" };
  }
  return { success: true };
}
