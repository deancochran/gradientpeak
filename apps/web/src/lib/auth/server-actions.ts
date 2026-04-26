import { getGradientPeakAuth } from "@repo/auth/server";
import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";

import { getSafeAppRedirectTarget, toAbsoluteAppUrl } from "../app-url";
import { buildFlashHref } from "../flash";
import {
  getForgotPasswordFormError,
  getLoginFormError,
  getSignUpFormError,
  getUpdatePasswordFormError,
} from "./form-errors";
import {
  forgotPasswordFormSchema,
  loginFormSchema,
  signUpFormSchema,
  updatePasswordFormSchema,
} from "./form-schemas";

const loginServerActionSchema = loginFormSchema.extend({
  redirect: z.string().optional(),
});

const signUpServerActionSchema = signUpFormSchema;
const forgotPasswordServerActionSchema = forgotPasswordFormSchema;
const updatePasswordServerActionSchema = updatePasswordFormSchema.extend({
  token: z.string().min(1, "Missing or invalid reset token"),
});
const verifyEmailServerActionSchema = z.object({
  email: z.email("Enter a valid email address"),
  source: z.string().optional(),
});

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function normalizeLoginServerActionInput(data: unknown) {
  const parsed = loginServerActionSchema.parse(
    data instanceof FormData ? Object.fromEntries(data.entries()) : data,
  );

  return {
    ...parsed,
    _native: data instanceof FormData,
  };
}

function normalizeSignUpServerActionInput(data: unknown) {
  const parsed = signUpServerActionSchema.parse(
    data instanceof FormData ? Object.fromEntries(data.entries()) : data,
  );

  return {
    ...parsed,
    _native: data instanceof FormData,
  };
}

function normalizeForgotPasswordServerActionInput(data: unknown) {
  const parsed = forgotPasswordServerActionSchema.parse(
    data instanceof FormData ? Object.fromEntries(data.entries()) : data,
  );

  return {
    ...parsed,
    _native: data instanceof FormData,
  };
}

function normalizeUpdatePasswordServerActionInput(data: unknown) {
  const parsed = updatePasswordServerActionSchema.parse(
    data instanceof FormData ? Object.fromEntries(data.entries()) : data,
  );

  return {
    ...parsed,
    _native: data instanceof FormData,
  };
}

function normalizeVerifyEmailServerActionInput(data: unknown) {
  const parsed = verifyEmailServerActionSchema.parse(
    data instanceof FormData ? Object.fromEntries(data.entries()) : data,
  );

  return {
    ...parsed,
    _native: data instanceof FormData,
  };
}

function getEmailVerificationCallbackUrl() {
  return toAbsoluteAppUrl(
    "/auth/confirm?target=web&intent=email-verification&fallback=/auth/verification-success",
  );
}

function buildLoginRedirectHref(
  redirectTo?: string,
  flashMessage?: string,
  flashType: "success" | "error" | "info" = "info",
) {
  const url = new URL("/auth/login", "http://gradientpeak.local");

  if (redirectTo) {
    url.searchParams.set("redirect", redirectTo);
  }

  const nextHref = `${url.pathname}${url.search}`;
  return flashMessage ? buildFlashHref(nextHref, flashMessage, flashType) : nextHref;
}

function buildUpdatePasswordRedirectHref(
  token?: string,
  flashMessage?: string,
  flashType: "success" | "error" | "info" = "info",
) {
  const url = new URL("/auth/update-password", "http://gradientpeak.local");

  if (token) {
    url.searchParams.set("token", token);
  }

  const nextHref = `${url.pathname}${url.search}`;
  return flashMessage ? buildFlashHref(nextHref, flashMessage, flashType) : nextHref;
}

function buildVerifyEmailRedirectHref(
  email: string,
  source?: string,
  flashMessage?: string,
  flashType: "success" | "error" | "info" = "info",
) {
  const url = new URL("/auth/verify", "http://gradientpeak.local");
  url.searchParams.set("email", email);

  if (source) {
    url.searchParams.set("source", source);
  }

  const nextHref = `${url.pathname}${url.search}`;
  return flashMessage ? buildFlashHref(nextHref, flashMessage, flashType) : nextHref;
}

export const signInWithEmailAction = createServerFn({ method: "POST" })
  .inputValidator((data) => normalizeLoginServerActionInput(data))
  .handler(async ({ data }) => {
    const auth = getGradientPeakAuth();

    try {
      await auth.api.signInEmail({
        body: {
          email: data.email,
          password: data.password,
        },
      });
    } catch (error) {
      const formError = getLoginFormError(error);

      if (data._native) {
        throw redirect({
          href: buildLoginRedirectHref(data.redirect, formError.message, "error"),
          statusCode: 303,
        });
      }

      throw new Error(formError.message);
    }

    throw redirect({
      href: getSafeAppRedirectTarget(data.redirect, "/"),
      statusCode: 303,
    });
  });

export const signUpWithEmailAction = createServerFn({ method: "POST" })
  .inputValidator((data) => normalizeSignUpServerActionInput(data))
  .handler(async ({ data }) => {
    const auth = getGradientPeakAuth();

    try {
      await auth.api.signUpEmail({
        body: {
          email: data.email,
          password: data.password,
          name: data.email.split("@")[0] || data.email,
          callbackURL: getEmailVerificationCallbackUrl(),
        },
      });
    } catch (error) {
      const formError = getSignUpFormError(error);

      if (data._native) {
        throw redirect({
          href: buildFlashHref("/auth/sign-up", formError.message, "error"),
          statusCode: 303,
        });
      }

      throw new Error(formError.message);
    }

    throw redirect({
      href: `/auth/sign-up-success?email=${encodeURIComponent(data.email)}`,
      statusCode: 303,
    });
  });

export const requestPasswordResetAction = createServerFn({ method: "POST" })
  .inputValidator((data) => normalizeForgotPasswordServerActionInput(data))
  .handler(async ({ data }) => {
    const auth = getGradientPeakAuth();

    try {
      await auth.api.requestPasswordReset({
        body: {
          email: data.email,
          redirectTo: toAbsoluteAppUrl("/auth/update-password"),
        },
      });
    } catch (error) {
      const formError = getForgotPasswordFormError(error);

      if (data._native) {
        throw redirect({
          href: buildFlashHref("/auth/forgot-password", formError.message, "error"),
          statusCode: 303,
        });
      }

      throw new Error(formError.message);
    }

    throw redirect({
      href: "/auth/forgot-password?flash=Password%20reset%20instructions%20sent&flashType=success",
      statusCode: 303,
    });
  });

export const resetPasswordAction = createServerFn({ method: "POST" })
  .inputValidator((data) => normalizeUpdatePasswordServerActionInput(data))
  .handler(async ({ data }) => {
    const auth = getGradientPeakAuth();

    try {
      await auth.api.resetPassword({
        body: {
          newPassword: data.password,
          token: data.token,
        },
      });
    } catch (error) {
      const formError = getUpdatePasswordFormError(error);

      if (data._native) {
        throw redirect({
          href: buildUpdatePasswordRedirectHref(data.token, formError.message, "error"),
          statusCode: 303,
        });
      }

      throw new Error(formError.message);
    }

    throw redirect({
      href: "/auth/login?flash=Password%20updated%20successfully&flashType=success",
      statusCode: 303,
    });
  });

export const sendVerificationEmailAction = createServerFn({ method: "POST" })
  .inputValidator((data) => normalizeVerifyEmailServerActionInput(data))
  .handler(async ({ data }) => {
    const auth = getGradientPeakAuth();

    try {
      await auth.api.sendVerificationEmail({
        body: {
          email: data.email,
          callbackURL: getEmailVerificationCallbackUrl(),
        },
      });
    } catch (error) {
      const message = "Unable to resend verification email";

      if (data._native) {
        throw redirect({
          href: buildVerifyEmailRedirectHref(data.email, data.source, message, "error"),
          statusCode: 303,
        });
      }

      throw new Error(message);
    }

    throw redirect({
      href: buildVerifyEmailRedirectHref(
        data.email,
        data.source,
        "Verification email sent. Check your inbox and spam folder.",
        "success",
      ),
      statusCode: 303,
    });
  });

export const signOutAction = createServerFn({ method: "POST" }).handler(async () => {
  const auth = getGradientPeakAuth();

  try {
    await auth.api.signOut({
      headers: getRequestHeaders(),
    });
  } catch (error) {
    throw new Error(getErrorMessage(error, "Unable to sign out"));
  }

  throw redirect({ href: "/auth/login?flash=Signed%20out&flashType=success", statusCode: 303 });
});
