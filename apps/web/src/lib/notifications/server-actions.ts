import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getSafeAppRedirectTarget } from "../app-url";
import { buildFlashHref } from "../flash";
import { createServerActionCaller } from "../server-action-api";

const notificationIdsActionSchema = z.object({
  notification_ids: z.array(z.string().uuid()).min(1),
  redirectTo: z.string().optional(),
});

function normalizeNotificationInput(data: unknown) {
  const native = data instanceof FormData;

  if (data instanceof FormData) {
    const redirectToValue = data.get("redirectTo");
    return {
      ...notificationIdsActionSchema.parse({
        notification_ids: data.getAll("notification_ids").map((value) => String(value)),
        redirectTo: typeof redirectToValue === "string" ? redirectToValue : undefined,
      }),
      _native: native,
    };
  }

  return {
    ...notificationIdsActionSchema.parse(data),
    _native: native,
  };
}

export const markNotificationsReadAction = createServerFn({ method: "POST" })
  .inputValidator((data) => normalizeNotificationInput(data))
  .handler(async ({ data }) => {
    try {
      const caller = await createServerActionCaller();
      await caller.notifications.markRead({ notification_ids: data.notification_ids });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update notifications";

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
        "Notifications updated",
        "success",
      ),
      statusCode: 303,
    });
  });
