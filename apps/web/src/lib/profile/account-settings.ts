import { CONTRACT_EPOCH_HEADER } from "@repo/api/client";
import { authEmailSchema } from "@repo/auth/forms";
import { getGradientPeakAuth } from "@repo/auth/server";
import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";

import { toAbsoluteAppUrl } from "../app-url";
import { buildFlashHref } from "../flash";
import { changePasswordFormSchema } from "./form-schemas";

function formObject(data: unknown) {
  if (!(data instanceof FormData)) return data;
  return Object.fromEntries(
    [...data.entries()].filter(([key]) => key !== "__async" && key !== CONTRACT_EPOCH_HEADER),
  );
}

const isEnhanced = (data: unknown) => data instanceof FormData && data.get("__async") === "true";

export const changePasswordAction = createServerFn({ method: "POST" })
  .validator((data) => ({
    ...changePasswordFormSchema.parse(formObject(data)),
    enhanced: isEnhanced(data),
  }))
  .handler(async ({ data }) => {
    try {
      await getGradientPeakAuth().api.changePassword({
        body: {
          currentPassword: data.currentPassword,
          newPassword: data.newPassword,
          revokeOtherSessions: true,
        },
        headers: getRequestHeaders(),
      });
    } catch (error) {
      if (data.enhanced)
        return {
          ok: false as const,
          message: "Password could not be updated. Check your current password and try again.",
        };
      const message = error instanceof Error ? error.message : "Unable to change password";
      throw redirect({ href: buildFlashHref("/settings", message, "error"), statusCode: 303 });
    }

    if (data.enhanced) return { ok: true as const };
    throw redirect({
      href: buildFlashHref(
        "/settings",
        "Password updated and other sessions signed out",
        "success",
      ),
      statusCode: 303,
    });
  });

export const revokeOtherSessionsAction = createServerFn({ method: "POST" })
  .validator((data: unknown) => ({ enhanced: isEnhanced(data) }))
  .handler(async ({ data }) => {
    try {
      await getGradientPeakAuth().api.revokeOtherSessions({ headers: getRequestHeaders() });
    } catch (error) {
      if (data.enhanced)
        return {
          ok: false as const,
          message: "Other sessions could not be signed out. Please try again.",
        };
      const message = error instanceof Error ? error.message : "Unable to sign out other sessions";
      throw redirect({ href: buildFlashHref("/settings", message, "error"), statusCode: 303 });
    }

    if (data.enhanced) return { ok: true as const };
    throw redirect({
      href: buildFlashHref("/settings", "Other sessions signed out", "success"),
      statusCode: 303,
    });
  });

export const resendVerificationFromSettingsAction = createServerFn({ method: "POST" })
  .validator((data) => ({
    ...z.object({ email: authEmailSchema }).strict().parse(formObject(data)),
    enhanced: isEnhanced(data),
  }))
  .handler(async ({ data }) => {
    try {
      await getGradientPeakAuth().api.sendVerificationEmail({
        body: {
          email: data.email,
          callbackURL: toAbsoluteAppUrl(
            "/auth/confirm?target=web&intent=email-verification&fallback=/auth/verification-success",
          ),
        },
      });
    } catch {
      // Keep the acknowledgement independent of delivery outcome.
    }

    if (data.enhanced) return { ok: true as const };
    throw redirect({
      href: buildFlashHref(
        "/settings",
        "If this address can receive verification, a message is on its way.",
        "success",
      ),
      statusCode: 303,
    });
  });
