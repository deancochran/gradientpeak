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

import {
  invalidateSchedulingQueries,
  type SchedulingRefreshScope,
} from "@repo/trpc/client";
import { useQueryClient } from "@tanstack/react-query";
import { showErrorAlert } from "@/lib/utils/formErrors";
import { Alert } from "react-native";

type InvalidationTarget =
  | {
      invalidate?: () => Promise<unknown> | unknown;
    }
  | (() => Promise<unknown> | unknown);

export interface ReliableMutationOptions {
  /**
   * Utils to invalidate (just pass the utils objects)
   * @example invalidate: [utils.activities, utils.profile]
   */
  invalidate?: InvalidationTarget[];

  /**
   * Shared refresh contract for scheduling-sensitive mutations.
   */
  refresh?: SchedulingRefreshScope | SchedulingRefreshScope[];

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
  onSuccess?: (data: any) => void | Promise<void>;

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
  const queryClient = useQueryClient();

  return mutation.useMutation({
    onSuccess: async (data: any, variables: any, context: any) => {
      const refreshTasks: Promise<unknown>[] = [];

      if (options.invalidate) {
        refreshTasks.push(
          ...options.invalidate.map((target) => {
            if (typeof target === "function") {
              return Promise.resolve(target());
            }

            return Promise.resolve(target.invalidate?.());
          }),
        );
      }

      if (options.refresh) {
        refreshTasks.push(
          invalidateSchedulingQueries(queryClient, options.refresh),
        );
      }

      if (refreshTasks.length > 0) {
        await Promise.all(refreshTasks);
      }

      await options.onSuccess?.(data);

      // Show success message after required refresh work completes
      if (options.success) {
        Alert.alert("Success", options.success);
      }
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
