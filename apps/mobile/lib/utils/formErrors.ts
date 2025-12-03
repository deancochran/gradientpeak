/**
 * Form Error Handling Utilities
 *
 * Provides user-friendly error messages for form submissions, network errors,
 * and validation failures. Integrates seamlessly with React Hook Form.
 */

import { FieldErrors } from 'react-hook-form';
import { Alert } from 'react-native';
import { ZodError } from 'zod';

/**
 * Maps common error codes/messages to user-friendly messages
 */
const ERROR_MESSAGE_MAP: Record<string, string> = {
  // Network errors
  'Failed to fetch': 'Unable to connect to the server. Please check your internet connection.',
  'Network request failed': 'Network error. Please check your connection and try again.',
  'NetworkError': 'Connection problem. Please try again.',
  'ECONNABORTED': 'Request timed out. Please try again.',

  // Auth errors
  'UNAUTHORIZED': 'Please sign in to continue.',
  'FORBIDDEN': 'You don\'t have permission to do that.',
  'Invalid credentials': 'Invalid email or password.',

  // Validation errors
  'VALIDATION_ERROR': 'Please check your input and try again.',
  'Invalid input': 'Some fields need your attention.',

  // Server errors
  'INTERNAL_SERVER_ERROR': 'Something went wrong on our end. Please try again.',
  'SERVICE_UNAVAILABLE': 'Service temporarily unavailable. Please try again later.',

  // Database errors
  'CONFLICT': 'This item already exists.',
  'NOT_FOUND': 'Item not found.',

  // Generic
  'UNKNOWN': 'Something went wrong. Please try again.',
};

/**
 * Extracts a user-friendly error message from various error types
 */
export function getErrorMessage(error: unknown): string {
  // Handle null/undefined
  if (!error) return 'An unexpected error occurred';

  // Handle Error objects
  if (error instanceof Error) {
    // Check for mapped messages
    for (const [key, message] of Object.entries(ERROR_MESSAGE_MAP)) {
      if (error.message.includes(key)) {
        return message;
      }
    }

    // Return original message if it's user-friendly (not too technical)
    if (error.message && error.message.length < 100 && !error.message.includes('Error:')) {
      return error.message;
    }
  }

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    const firstError = error.errors[0];
    if (firstError) {
      return firstError.message;
    }
  }

  // Handle tRPC/API errors with shape
  if (typeof error === 'object' && error !== null) {
    const err = error as any;

    // tRPC error format
    if (err.data?.code && ERROR_MESSAGE_MAP[err.data.code]) {
      return ERROR_MESSAGE_MAP[err.data.code];
    }

    // Check for message property
    if (err.message && typeof err.message === 'string') {
      return getErrorMessage(new Error(err.message));
    }

    // Check for error property
    if (err.error && typeof err.error === 'string') {
      return err.error;
    }
  }

  // Handle string errors
  if (typeof error === 'string') {
    return error || 'An error occurred';
  }

  // Fallback
  return 'Something went wrong. Please try again.';
}

/**
 * Shows an error alert with a user-friendly message
 */
export function showErrorAlert(error: unknown, title = 'Error') {
  const message = getErrorMessage(error);
  Alert.alert(title, message, [{ text: 'OK' }]);
}

/**
 * Gets the first error message from React Hook Form errors
 */
export function getFirstFormError(errors: FieldErrors): string | null {
  const firstErrorKey = Object.keys(errors)[0];
  if (!firstErrorKey) return null;

  const error = errors[firstErrorKey];
  return error?.message?.toString() || 'This field has an error';
}

/**
 * Shows an alert with the first form validation error
 */
export function showFormErrorAlert(errors: FieldErrors, title = 'Please check your input') {
  const message = getFirstFormError(errors);
  if (message) {
    Alert.alert(title, message, [{ text: 'OK' }]);
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
  showErrorAlert(error, 'Submission Failed');
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
  } = {}
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
      error.message.includes('fetch') ||
      error.message.includes('network') ||
      error.message.includes('Network') ||
      error.message.includes('connection')
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
    message.includes('sign in') ||
    message.includes('permission') ||
    message.includes('unauthorized')
  );
}
