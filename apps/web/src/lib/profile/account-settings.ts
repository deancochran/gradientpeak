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
  return data instanceof FormData ? Object.fromEntries(data.entries()) : data;
}

export const changePasswordAction = createServerFn({ method: "POST" })
  .inputValidator((data) => changePasswordFormSchema.parse(formObject(data)))
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
      const message = error instanceof Error ? error.message : "Unable to change password";
      throw redirect({ href: buildFlashHref("/settings", message, "error"), statusCode: 303 });
    }

    throw redirect({
      href: buildFlashHref(
        "/settings",
        "Password updated and other sessions signed out",
        "success",
      ),
      statusCode: 303,
    });
  });

export const revokeOtherSessionsAction = createServerFn({ method: "POST" }).handler(async () => {
  try {
    await getGradientPeakAuth().api.revokeOtherSessions({ headers: getRequestHeaders() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to sign out other sessions";
    throw redirect({ href: buildFlashHref("/settings", message, "error"), statusCode: 303 });
  }

  throw redirect({
    href: buildFlashHref("/settings", "Other sessions signed out", "success"),
    statusCode: 303,
  });
});

export const resendVerificationFromSettingsAction = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ email: authEmailSchema }).strict().parse(formObject(data)))
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
      throw redirect({
        href: buildFlashHref("/settings", "Unable to resend verification email", "error"),
        statusCode: 303,
      });
    }

    throw redirect({
      href: buildFlashHref("/settings", "Verification email sent", "success"),
      statusCode: 303,
    });
  });
