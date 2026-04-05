import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { AuthRequestTimeoutError, getAuthRequestTimeoutMessage } from "@/lib/auth/request-timeout";
import { getHostedApiUrl, setServerUrlOverride } from "@/lib/server-config";
import { useAuthStore } from "@/lib/stores/auth-store";

type FormErrorTarget<TFieldValues extends FieldValues> = {
  message: string;
  name: Path<TFieldValues> | "root";
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

export function mapSignInError(message?: string | null) {
  if (message?.includes("Invalid login credentials")) {
    return {
      type: "form-error" as const,
      error: {
        name: "root" as const,
        message: "Invalid email or password. Please try again.",
      },
    };
  }

  if (message?.includes("Email not confirmed")) {
    return { type: "verify-email" as const };
  }

  return {
    type: "form-error" as const,
    error: {
      name: "root" as const,
      message: message || "An unexpected error occurred",
    },
  };
}

export function mapSignUpError(message?: string | null) {
  if (message?.includes("User already registered")) {
    return {
      name: "email" as const,
      message: "An account with this email already exists",
    };
  }

  if (message?.includes("Password should be")) {
    return {
      name: "password" as const,
      message: message,
    };
  }

  if (message?.includes("Unable to validate email")) {
    return {
      name: "email" as const,
      message: "Please enter a valid email address",
    };
  }

  return {
    name: "root" as const,
    message: message || "An unexpected error occurred",
  };
}

export function mapForgotPasswordError(message?: string | null) {
  if (message?.includes("User not found")) {
    return {
      name: "email" as const,
      message: "No account found with this email address",
    };
  }

  if (message?.includes("Email rate limit")) {
    return {
      name: "email" as const,
      message: "Too many requests. Please try again later.",
    };
  }

  return {
    name: "email" as const,
    message: message || "Failed to send reset email",
  };
}

export function mapResetPasswordError(message?: string | null) {
  return {
    name: "root" as const,
    message: message || "An unexpected error occurred",
  };
}
