import { z } from "zod";

export const authEmailSchema = z
  .string({ message: "Email is required" })
  .trim()
  .min(1, "Email is required")
  .email("Enter a valid email address");

export const authRequiredPasswordSchema = z
  .string({ message: "Password is required" })
  .min(1, "Password is required");

export const authPasswordSchema = z
  .string({ message: "Password is required" })
  .min(8, "Password must be at least 8 characters");

export const authStrongPasswordSchema = authPasswordSchema
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[0-9]/, "Password must contain at least one number");

const confirmPasswordSchema = z
  .string({ message: "Please confirm your password" })
  .min(1, "Please confirm your password");

export const loginFormSchema = z.object({
  email: authEmailSchema,
  password: authRequiredPasswordSchema,
});

export const signInSchema = z.object({
  email: authEmailSchema,
  password: authPasswordSchema,
});

export const signUpFormSchema = z
  .object({
    email: authEmailSchema,
    password: authStrongPasswordSchema,
    repeatPassword: confirmPasswordSchema,
  })
  .refine((data) => data.password === data.repeatPassword, {
    message: "Passwords do not match",
    path: ["repeatPassword"],
  });

export const forgotPasswordFormSchema = z.object({
  email: authEmailSchema,
});

export const updatePasswordFormSchema = z
  .object({
    password: authStrongPasswordSchema,
    confirmPassword: confirmPasswordSchema,
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const resetPasswordSchema = updatePasswordFormSchema;

export type LoginFormValues = z.output<typeof loginFormSchema>;
export type SignInFields = z.output<typeof signInSchema>;
export type SignUpFormValues = z.output<typeof signUpFormSchema>;
export type SignUpFields = SignUpFormValues;
export type ForgotPasswordFormValues = z.output<typeof forgotPasswordFormSchema>;
export type ForgotPasswordFields = ForgotPasswordFormValues;
export type UpdatePasswordFormValues = z.output<typeof updatePasswordFormSchema>;
export type ResetPasswordFields = z.output<typeof resetPasswordSchema>;

export type AuthFormErrorTarget = "root" | "email" | "password";

export type AuthFormError = {
  message: string;
  target: AuthFormErrorTarget;
};

export type SignInErrorResult =
  | { type: "verify-email" }
  | { type: "form-error"; error: AuthFormError };

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.length > 0) {
    return error;
  }

  return fallback;
}

export function getLoginFormError(error: unknown): AuthFormError {
  const message = getErrorMessage(error, "An unexpected error occurred");

  if (message.includes("Invalid login credentials")) {
    return {
      message: "Invalid email or password. Please try again.",
      target: "root",
    };
  }

  return { message, target: "root" };
}

export function getSignInFormError(message?: string | null): SignInErrorResult {
  const normalizedMessage = message?.toLowerCase();

  if (message?.includes("Invalid login credentials")) {
    return {
      type: "form-error",
      error: {
        target: "root",
        message: "Invalid email or password. Please try again.",
      },
    };
  }

  if (
    normalizedMessage?.includes("email not confirmed") ||
    normalizedMessage?.includes("email not verified") ||
    normalizedMessage?.includes("email isn't verified") ||
    normalizedMessage?.includes("email is not verified") ||
    ((normalizedMessage?.includes("verify") || normalizedMessage?.includes("verified")) &&
      normalizedMessage?.includes("email"))
  ) {
    return { type: "verify-email" };
  }

  return {
    type: "form-error",
    error: {
      target: "root",
      message: message || "An unexpected error occurred",
    },
  };
}

export function getSignUpFormError(error: unknown): AuthFormError {
  const message = getErrorMessage(error, "An unexpected error occurred");

  if (
    message.includes("User already registered") ||
    message.includes("User already exists. Use another email.")
  ) {
    return { message: "An account with this email already exists", target: "email" };
  }

  if (message.includes("Unable to validate email")) {
    return { message: "Please enter a valid email address", target: "email" };
  }

  if (message.includes("Password should be")) {
    return { message, target: "password" };
  }

  return { message, target: "root" };
}

export function getForgotPasswordFormError(error: unknown): AuthFormError {
  const message = getErrorMessage(error, "Failed to send reset email");

  if (message.includes("User not found")) {
    return { message: "No account found with this email address", target: "email" };
  }

  if (message.includes("Email rate limit")) {
    return { message: "Too many requests. Please try again later.", target: "email" };
  }

  return { message, target: "email" };
}

export function getUpdatePasswordFormError(error: unknown): AuthFormError {
  const message = getErrorMessage(error, "An unexpected error occurred");

  if (message.includes("Password should be")) {
    return { message, target: "password" };
  }

  return { message, target: "root" };
}

export function getDisplayNameFromEmail(email: string) {
  return email.split("@")[0] || email;
}
