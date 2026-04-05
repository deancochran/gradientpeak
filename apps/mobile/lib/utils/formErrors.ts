/**
 * Form Error Handling Utilities
 *
 * Provides user-friendly error messages for form submissions, network errors,
 * and validation failures. Integrates seamlessly with React Hook Form.
 */

import type { FieldErrors, FieldValues, Path, UseFormReturn } from "react-hook-form";
import { Alert } from "react-native";
import { ZodError } from "zod";

/**
 * Maps common error codes/messages to user-friendly messages
 */
const ERROR_MESSAGE_MAP: Record<string, string> = {
  // Network errors
  "Failed to fetch": "Unable to connect to the server. Please check your internet connection.",
  "Network request failed": "Network error. Please check your connection and try again.",
  NetworkError: "Connection problem. Please try again.",
  ECONNABORTED: "Request timed out. Please try again.",

  // Auth errors
  UNAUTHORIZED: "Please sign in to continue.",
  FORBIDDEN: "You don't have permission to do that.",
  "Invalid credentials": "Invalid email or password.",

  // Validation errors
  VALIDATION_ERROR: "Please check your input and try again.",
  "Invalid input": "Some fields need your attention.",

  // Server errors
  INTERNAL_SERVER_ERROR: "Something went wrong on our end. Please try again.",
  SERVICE_UNAVAILABLE: "Service temporarily unavailable. Please try again later.",

  // Database errors
  CONFLICT: "This item already exists.",
  NOT_FOUND: "Item not found.",

  // Generic
  UNKNOWN: "Something went wrong. Please try again.",
};

/**
 * Extracts a user-friendly error message from various error types
 */
export function getErrorMessage(error: unknown): string {
  // Handle null/undefined
  if (!error) return "An unexpected error occurred";

  // Handle Error objects
  if (error instanceof Error) {
    // Check for mapped messages
    for (const [key, message] of Object.entries(ERROR_MESSAGE_MAP)) {
      if (error.message.includes(key)) {
        return message;
      }
    }

    // Return original message if it's user-friendly (not too technical)
    if (error.message && error.message.length < 100 && !error.message.includes("Error:")) {
      return error.message;
    }
  }

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    if (error.issues) return error.issues[0].message;
    else if (error.message) return error.message;
    else if (error.name) return error.name;
    else return "An unexpected error occurred";
  }

  // Handle API/API errors with shape
  if (typeof error === "object" && error !== null) {
    const err = error as any;

    // API error format
    if (err.data?.code && ERROR_MESSAGE_MAP[err.data.code]) {
      return ERROR_MESSAGE_MAP[err.data.code];
    }

    // Check for message property
    if (err.message && typeof err.message === "string") {
      return getErrorMessage(new Error(err.message));
    }

    // Check for error property
    if (err.error && typeof err.error === "string") {
      return err.error;
    }
  }

  // Handle string errors
  if (typeof error === "string") {
    return error || "An error occurred";
  }

  // Fallback
  return "Something went wrong. Please try again.";
}

/**
 * Shows an error alert with a user-friendly message
 */
export function showErrorAlert(error: unknown, title = "Error") {
  const message = getErrorMessage(error);
  Alert.alert(title, message, [{ text: "OK" }]);
}

function getFieldErrorMessage(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string" && item.length > 0) {
        return item;
      }
    }
  }

  return null;
}

export function extractFieldErrors(error: unknown): Record<string, string> | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const typedError = error as {
    data?: { zodError?: { fieldErrors?: Record<string, unknown> } };
    field?: unknown;
    message?: unknown;
    errors?: Array<{ path?: unknown; message?: unknown }>;
  };

  const zodFieldErrors = typedError.data?.zodError?.fieldErrors;
  if (zodFieldErrors) {
    const mappedEntries = Object.entries(zodFieldErrors)
      .map(([field, value]) => [field, getFieldErrorMessage(value)] as const)
      .filter((entry): entry is readonly [string, string] => entry[1] !== null);

    if (mappedEntries.length > 0) {
      return Object.fromEntries(mappedEntries);
    }
  }

  if (typeof typedError.field === "string") {
    const message = getFieldErrorMessage(typedError.message);
    if (message) {
      return { [typedError.field]: message };
    }
  }

  if (Array.isArray(typedError.errors)) {
    const fieldErrors: Record<string, string> = {};

    for (const entry of typedError.errors) {
      const message = getFieldErrorMessage(entry.message);
      if (!message) {
        continue;
      }

      const field = Array.isArray(entry.path)
        ? entry.path.map((segment) => String(segment)).join(".")
        : typeof entry.path === "string"
          ? entry.path
          : null;

      if (field) {
        fieldErrors[field] = message;
      }
    }

    if (Object.keys(fieldErrors).length > 0) {
      return fieldErrors;
    }
  }

  return null;
}

export function applyServerFormErrors<TFieldValues extends FieldValues>(
  form: Pick<UseFormReturn<TFieldValues>, "setError">,
  error: unknown,
) {
  const fieldErrors = extractFieldErrors(error);
  if (!fieldErrors) {
    return false;
  }

  for (const [field, message] of Object.entries(fieldErrors)) {
    form.setError(field as Path<TFieldValues>, {
      type: "server",
      message,
    });
  }

  return true;
}

/**
 * Gets the first error message from React Hook Form errors
 */
export function getFirstFormError(errors: FieldErrors): string | null {
  const firstErrorKey = Object.keys(errors)[0];
  if (!firstErrorKey) return null;

  const error = errors[firstErrorKey];
  return error?.message?.toString() || "This field has an error";
}

/**
 * Shows an alert with the first form validation error
 */
export function showFormErrorAlert(errors: FieldErrors, title = "Please check your input") {
  const message = getFirstFormError(errors);
  if (message) {
    Alert.alert(title, message, [{ text: "OK" }]);
  }
}

/**
 * Handles form submission errors with smart error detection
 * Shows appropriate error messages for validation vs submission errors
 */
export function handleFormSubmissionError(error: unknown, formErrors?: FieldErrors) {
  // If we have form validation errors, show those first
  if (formErrors && Object.keys(formErrors).length > 0) {
    showFormErrorAlert(formErrors);
    return;
  }

  // Otherwise show the submission error
  showErrorAlert(error, "Submission Failed");
}

/**
 * React Hook Form onError handler
 * Usage: form.handleSubmit(onSubmit, formErrorHandler)
 */
export function formErrorHandler(errors: FieldErrors) {
  showFormErrorAlert(errors);
}

/**
 * Wraps an async form submission with automatic error handling
 * Returns a safe version that catches and displays errors
 */
export function withFormErrorHandling<T extends any[]>(
  submitFn: (...args: T) => Promise<void>,
  options: {
    onError?: (error: unknown) => void;
    errorTitle?: string;
    suppressAlert?: boolean;
  } = {},
) {
  return async (...args: T) => {
    try {
      await submitFn(...args);
    } catch (error) {
      // Call custom error handler if provided
      options.onError?.(error);

      // Show alert unless suppressed
      if (!options.suppressAlert) {
        showErrorAlert(error, options.errorTitle);
      }

      // Don't re-throw - we've handled it
    }
  };
}

/**
 * Validates if an error is a network error
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.message.includes("fetch") ||
      error.message.includes("network") ||
      error.message.includes("Network") ||
      error.message.includes("connection")
    );
  }
  return false;
}

/**
 * Validates if an error is an auth error
 */
export function isAuthError(error: unknown): boolean {
  const message = getErrorMessage(error);
  return (
    message.includes("sign in") ||
    message.includes("permission") ||
    message.includes("unauthorized")
  );
}
