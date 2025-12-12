/**
 * useFormSubmit - Guaranteed Form Submission Handler
 *
 * Wrapper around React Hook Form's handleSubmit that guarantees:
 * - ✅ Automatic error handling for validation failures
 * - ✅ Automatic error handling for submission failures
 * - ✅ Loading state management
 * - ✅ Success callbacks with cleanup
 * - ✅ Type-safe form data
 *
 * @example
 * ```tsx
 * const form = useForm({ schema });
 * const { handleSubmit, isSubmitting } = useFormSubmit({
 *   form,
 *   onSubmit: async (data) => {
 *     await api.createActivity(data);
 *   },
 *   onSuccess: () => router.back(),
 *   successMessage: 'Activity created!',
 * });
 *
 * <Button onPress={handleSubmit} disabled={isSubmitting}>
 *   Submit
 * </Button>
 * ```
 */

import { showErrorAlert, showFormErrorAlert } from "@/lib/utils/formErrors";
import { useCallback, useState } from "react";
import { Alert } from "react-native";
import type { FieldValues, UseFormReturn } from "react-hook-form";

export interface UseFormSubmitConfig<TFormData extends FieldValues> {
  /**
   * React Hook Form instance
   */
  form: UseFormReturn<TFormData>;

  /**
   * Submit handler - receives validated form data
   * Should throw on error
   */
  onSubmit: (data: TFormData) => Promise<void> | void;

  /**
   * Success callback - runs after successful submission
   */
  onSuccess?: (data: TFormData) => void | Promise<void>;

  /**
   * Error callback - runs before showing error alert
   * Return false to prevent default error handling
   */
  onError?: (error: Error) => boolean | void;

  /**
   * Success message to show
   */
  successMessage?: string;

  /**
   * Custom error title
   */
  errorTitle?: string;

  /**
   * Disable automatic error alerts
   */
  suppressErrorAlert?: boolean;

  /**
   * Reset form after successful submission
   * Default: false
   */
  resetOnSuccess?: boolean;
}

export interface UseFormSubmitResult {
  /**
   * Wrapped submit handler
   * Handles validation and submission errors automatically
   */
  handleSubmit: () => void;

  /**
   * Whether form is currently submitting
   */
  isSubmitting: boolean;

  /**
   * Whether submission was successful
   */
  isSuccess: boolean;

  /**
   * Current error (if any)
   */
  error: Error | null;

  /**
   * Reset submission state
   */
  reset: () => void;
}

export function useFormSubmit<TFormData extends FieldValues>(
  config: UseFormSubmitConfig<TFormData>,
): UseFormSubmitResult {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const reset = useCallback(() => {
    setIsSubmitting(false);
    setIsSuccess(false);
    setError(null);
  }, []);

  const handleSubmit = useCallback(() => {
    config.form.handleSubmit(
      // On valid submission
      async (data: TFormData) => {
        setIsSubmitting(true);
        setError(null);
        setIsSuccess(false);

        try {
          // Execute submission
          await config.onSubmit(data);

          // Show success message
          if (config.successMessage) {
            Alert.alert("Success", config.successMessage);
          }

          // Reset form if configured
          if (config.resetOnSuccess) {
            config.form.reset();
          }

          // Run success callback
          if (config.onSuccess) {
            await config.onSuccess(data);
          }

          setIsSuccess(true);
        } catch (err) {
          const typedError = err instanceof Error ? err : new Error(String(err));
          setError(typedError);

          // Call custom error handler
          let showAlert = !config.suppressErrorAlert;
          if (config.onError) {
            const result = config.onError(typedError);
            if (result === false) {
              showAlert = false;
            }
          }

          // Show error alert
          if (showAlert) {
            showErrorAlert(typedError, config.errorTitle || "Submission Failed");
          }
        } finally {
          setIsSubmitting(false);
        }
      },
      // On validation failure
      (errors) => {
        showFormErrorAlert(errors, "Please check your input");
      },
    )();
  }, [config]);

  return {
    handleSubmit,
    isSubmitting,
    isSuccess,
    error,
    reset,
  };
}
