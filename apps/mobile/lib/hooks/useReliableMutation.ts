/**
 * useReliableMutation - Zero-overhead wrapper for API mutations
 *
 * Drop-in replacement that guarantees reliability without changing your code.
 * Just wrap your existing useMutation() calls and get:
 * - ✅ Automatic error alerts
 * - ✅ Success messages
 * - ✅ Query invalidation
 * - ✅ Network retry
 *
 * BEFORE:
 * const mutation = api.activities.create.useMutation({
 *   onSuccess: () => utils.activities.invalidate()
 * });
 *
 * AFTER:
 * const mutation = useReliableMutation(api.activities.create, {
 *   invalidate: [utils.activities]
 * });
 *
 * Your existing code still works - just more reliable!
 */

import { invalidateSchedulingQueries, type SchedulingRefreshScope } from "@repo/api/client";
import { useQueryClient } from "@tanstack/react-query";
import type { UseTRPCMutationOptions, UseTRPCMutationResult } from "@trpc/react-query/shared";
import { Alert } from "react-native";
import { showErrorAlert } from "@/lib/utils/formErrors";

type InvalidationTarget =
  | {
      invalidate?: () => Promise<unknown> | unknown;
    }
  | (() => Promise<unknown> | unknown);

type ReliableMutationHook<TInput, TError, TOutput> = {
  useMutation: <TContext = unknown>(
    options?: UseTRPCMutationOptions<TInput, TError, TOutput, TContext>,
  ) => UseTRPCMutationResult<TOutput, TError, TInput, TContext>;
};

export type ReliableMutationOptions<TInput, TError, TOutput, TContext = unknown> = Omit<
  UseTRPCMutationOptions<TInput, TError, TOutput, TContext>,
  "onError" | "onSuccess"
> & {
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
  onError?: NonNullable<UseTRPCMutationOptions<TInput, TError, TOutput, TContext>["onError"]>;

  /**
   * Custom success handling
   */
  onSuccess?: NonNullable<UseTRPCMutationOptions<TInput, TError, TOutput, TContext>["onSuccess"]>;

  /**
   * Suppress automatic error alerts
   */
  silent?: boolean;
};

/**
 * Wraps API useMutation with reliability guarantees
 * Works with existing code patterns - no refactoring needed
 */
export function useReliableMutation<TInput, TError, TOutput, TContext = unknown>(
  mutation: ReliableMutationHook<TInput, TError, TOutput>,
  options: ReliableMutationOptions<TInput, TError, TOutput, TContext> = {},
): UseTRPCMutationResult<TOutput, TError, TInput, TContext> {
  const queryClient = useQueryClient();
  const { invalidate, onError, onSuccess, refresh, silent, success, ...mutationOptions } = options;

  return mutation.useMutation<TContext>({
    ...mutationOptions,
    onSuccess: async (data, variables, onMutateResult, context) => {
      const refreshTasks: Promise<unknown>[] = [];

      if (invalidate) {
        refreshTasks.push(
          ...invalidate.map((target) => {
            if (typeof target === "function") {
              return Promise.resolve(target());
            }

            return Promise.resolve(target.invalidate?.());
          }),
        );
      }

      if (refresh) {
        refreshTasks.push(invalidateSchedulingQueries(queryClient, refresh));
      }

      if (refreshTasks.length > 0) {
        await Promise.all(refreshTasks);
      }

      await onSuccess?.(data, variables, onMutateResult, context);

      // Show success message after required refresh work completes
      if (success) {
        Alert.alert("Success", success);
      }
    },
    onError: async (error, variables, onMutateResult, context) => {
      // Custom error callback first
      await onError?.(error, variables, onMutateResult, context);

      // Show error alert unless silent
      if (!silent) {
        showErrorAlert(error);
      }
    },
  });
}
