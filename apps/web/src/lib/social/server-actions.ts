import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getSafeAppRedirectTarget } from "../app-url";
import { buildFlashHref } from "../flash";
import { createServerActionCaller } from "../server-action-api";

const targetUserActionSchema = z.object({
  redirectTo: z.string().optional(),
  target_user_id: z.string().uuid(),
});

const followerActionSchema = z.object({
  follower_id: z.string().uuid(),
  redirectTo: z.string().optional(),
});

function normalizeTargetUserInput(data: unknown) {
  const parsed = targetUserActionSchema.parse(
    data instanceof FormData ? Object.fromEntries(data.entries()) : data,
  );

  return {
    ...parsed,
    _native: data instanceof FormData,
  };
}

function normalizeFollowerInput(data: unknown) {
  const parsed = followerActionSchema.parse(
    data instanceof FormData ? Object.fromEntries(data.entries()) : data,
  );

  return {
    ...parsed,
    _native: data instanceof FormData,
  };
}

export const followUserAction = createServerFn({ method: "POST" })
  .inputValidator((data) => normalizeTargetUserInput(data))
  .handler(async ({ data }) => {
    try {
      const caller = await createServerActionCaller();
      await caller.social.followUser({ target_user_id: data.target_user_id });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to follow user";

      if (data._native) {
        throw redirect({
          href: buildFlashHref(getSafeAppRedirectTarget(data.redirectTo, "/"), message, "error"),
          statusCode: 303,
        });
      }

      throw error;
    }

    throw redirect({
      href: buildFlashHref(
        getSafeAppRedirectTarget(data.redirectTo, "/"),
        "Follow request sent",
        "success",
      ),
      statusCode: 303,
    });
  });

export const unfollowUserAction = createServerFn({ method: "POST" })
  .inputValidator((data) => normalizeTargetUserInput(data))
  .handler(async ({ data }) => {
    try {
      const caller = await createServerActionCaller();
      await caller.social.unfollowUser({ target_user_id: data.target_user_id });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to unfollow user";

      if (data._native) {
        throw redirect({
          href: buildFlashHref(getSafeAppRedirectTarget(data.redirectTo, "/"), message, "error"),
          statusCode: 303,
        });
      }

      throw error;
    }

    throw redirect({
      href: buildFlashHref(
        getSafeAppRedirectTarget(data.redirectTo, "/"),
        "Unfollowed user",
        "success",
      ),
      statusCode: 303,
    });
  });

export const acceptFollowRequestAction = createServerFn({ method: "POST" })
  .inputValidator((data) => normalizeFollowerInput(data))
  .handler(async ({ data }) => {
    try {
      const caller = await createServerActionCaller();
      await caller.social.acceptFollowRequest({ follower_id: data.follower_id });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to accept follow request";

      if (data._native) {
        throw redirect({
          href: buildFlashHref(
            getSafeAppRedirectTarget(data.redirectTo, "/notifications"),
            message,
            "error",
          ),
          statusCode: 303,
        });
      }

      throw error;
    }

    throw redirect({
      href: buildFlashHref(
        getSafeAppRedirectTarget(data.redirectTo, "/notifications"),
        "Follow request accepted",
        "success",
      ),
      statusCode: 303,
    });
  });

export const rejectFollowRequestAction = createServerFn({ method: "POST" })
  .inputValidator((data) => normalizeFollowerInput(data))
  .handler(async ({ data }) => {
    try {
      const caller = await createServerActionCaller();
      await caller.social.rejectFollowRequest({ follower_id: data.follower_id });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to reject follow request";

      if (data._native) {
        throw redirect({
          href: buildFlashHref(
            getSafeAppRedirectTarget(data.redirectTo, "/notifications"),
            message,
            "error",
          ),
          statusCode: 303,
        });
      }

      throw error;
    }

    throw redirect({
      href: buildFlashHref(
        getSafeAppRedirectTarget(data.redirectTo, "/notifications"),
        "Follow request rejected",
        "success",
      ),
      statusCode: 303,
    });
  });

export const startDirectMessageAction = createServerFn({ method: "POST" })
  .inputValidator((data) => normalizeTargetUserInput(data))
  .handler(async ({ data }) => {
    let conversationId: string | null = null;

    try {
      const caller = await createServerActionCaller();
      const conversation = await caller.messaging.getOrCreateDM({
        target_user_id: data.target_user_id,
      });
      conversationId = conversation.id;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to start conversation";

      if (data._native) {
        throw redirect({
          href: buildFlashHref(
            getSafeAppRedirectTarget(data.redirectTo, "/messages"),
            message,
            "error",
          ),
          statusCode: 303,
        });
      }

      throw error;
    }

    throw redirect({
      href: buildFlashHref(
        conversationId ? `/messages?conversationId=${conversationId}` : "/messages",
        "Conversation ready",
        "success",
      ),
      statusCode: 303,
    });
  });
