type FormErrorTarget = "root" | "email" | "password";

export type AuthFormError = {
  message: string;
  target: FormErrorTarget;
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
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

export function getSignUpFormError(error: unknown): AuthFormError {
  const message = getErrorMessage(error, "An unexpected error occurred");

  if (message.includes("User already registered")) {
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
