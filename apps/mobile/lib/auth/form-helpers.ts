import {
  getForgotPasswordFormError,
  getSignInFormError,
  getSignUpFormError,
  getUpdatePasswordFormError,
} from "@repo/auth/forms";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { AuthRequestTimeoutError, getAuthRequestTimeoutMessage } from "@/lib/auth/request-timeout";
import { getHostedApiUrl, setServerUrlOverride } from "@/lib/server-config";
import { useAuthStore } from "@/lib/stores/auth-store";

type FormErrorTarget<TFieldValues extends FieldValues> = {
  message: string;
  name: Path<TFieldValues> | "root";
};

type SignInMappedError =
  | { type: "verify-email" }
  | { type: "form-error"; error: { name: "root"; message: string } };

type SignUpMappedError = {
  name: "root" | "email" | "password";
  message: string;
};

type ForgotPasswordMappedError = {
  name: "email";
  message: string;
};

type ResetPasswordMappedError = {
  name: "root" | "password";
  message: string;
};

export async function applyPendingAuthServerOverride(params: {
  expanded: boolean;
  serverUrlInput: string;
}) {
  if (!params.expanded) {
    return;
  }

  const nextUrl = params.serverUrlInput.trim();
  const hostedApiUrl = getHostedApiUrl();
  const { changed } = await setServerUrlOverride(
    nextUrl.length === 0 || nextUrl === hostedApiUrl ? null : nextUrl,
  );

  if (changed) {
    await useAuthStore.getState().clearSession();
  }
}

export function getAuthFormUnexpectedErrorMessage(error: unknown) {
  return error instanceof AuthRequestTimeoutError
    ? getAuthRequestTimeoutMessage()
    : "An unexpected error occurred";
}

export function setAuthFormError<TFieldValues extends FieldValues>(
  form: Pick<UseFormReturn<TFieldValues>, "setError">,
  error: FormErrorTarget<TFieldValues>,
) {
  form.setError(error.name, {
    message: error.message,
  });
}

export function mapSignInError(message?: string | null): SignInMappedError {
  const mapped = getSignInFormError(message);
  if (mapped.type === "verify-email") return mapped;

  return {
    type: "form-error" as const,
    error: {
      name: "root",
      message: mapped.error.message,
    },
  };
}

export function mapSignUpError(message?: string | null): SignUpMappedError {
  const mapped = getSignUpFormError(message);

  return {
    name: mapped.target,
    message: mapped.message,
  };
}

export function mapForgotPasswordError(message?: string | null): ForgotPasswordMappedError {
  const mapped = getForgotPasswordFormError(message || undefined);

  return {
    name: "email",
    message: mapped.message,
  };
}

export function mapResetPasswordError(message?: string | null): ResetPasswordMappedError {
  const mapped = getUpdatePasswordFormError(message || undefined);

  return {
    name: mapped.target === "password" ? "password" : "root",
    message: mapped.message,
  };
}
