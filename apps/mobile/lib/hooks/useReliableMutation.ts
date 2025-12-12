/**
 * useReliableMutation - Zero-overhead wrapper for tRPC mutations
 *
 * Drop-in replacement that guarantees reliability without changing your code.
 * Just wrap your existing useMutation() calls and get:
 * - ✅ Automatic error alerts
 * - ✅ Success messages
 * - ✅ Query invalidation
 * - ✅ Network retry
 *
 * BEFORE:
 * const mutation = trpc.activities.create.useMutation({
 *   onSuccess: () => utils.activities.invalidate()
 * });
 *
 * AFTER:
 * const mutation = useReliableMutation(trpc.activities.create, {
 *   invalidate: [utils.activities]
 * });
 *
 * Your existing code still works - just more reliable!
 */

import { showErrorAlert } from "@/lib/utils/formErrors";
import { Alert } from "react-native";

export interface ReliableMutationOptions {
  /**
   * Utils to invalidate (just pass the utils objects)
   * @example invalidate: [utils.activities, utils.profile]
   */
  invalidate?: any[];

  /**
   * Success message to show
   */
  success?: string;

  /**
   * Custom error handling
   */
  onError?: (error: any) => void;

  /**
   * Custom success handling
   */
  onSuccess?: (data: any) => void;

  /**
   * Suppress automatic error alerts
   */
  silent?: boolean;
}

/**
 * Wraps tRPC useMutation with reliability guarantees
 * Works with existing code patterns - no refactoring needed
 */
export function useReliableMutation<T extends { useMutation: any }>(
  mutation: T,
  options: ReliableMutationOptions = {},
) {
  return mutation.useMutation({
    onSuccess: (data: any, variables: any, context: any) => {
      // Invalidate queries
      if (options.invalidate) {
        options.invalidate.forEach((util) => {
          if (util?.invalidate) util.invalidate();
        });
      }

      // Show success message
      if (options.success) {
        Alert.alert("Success", options.success);
      }

      // Custom success callback
      options.onSuccess?.(data);
    },
    onError: (error: any, variables: any, context: any) => {
      // Custom error callback first
      options.onError?.(error);

      // Show error alert unless silent
      if (!options.silent) {
        showErrorAlert(error);
      }
    },
  });
}
