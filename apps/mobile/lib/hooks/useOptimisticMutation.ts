import { showErrorAlert } from "@/lib/utils/formErrors";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { Alert } from "react-native";

/**
 * Configuration for optimistic mutations
 */
export interface OptimisticMutationConfig<
  TData,
  TVariables,
  TContext = unknown,
> {
  /**
   * Query key to update optimistically
   */
  queryKey: readonly unknown[];

  /**
   * Function to update cache optimistically
   * Should return the new cache value
   */
  updater: (oldData: TData | undefined, variables: TVariables) => TData;

  /**
   * Optional custom error handler
   * If not provided, shows a generic alert
   */
  onError?: (error: Error, variables: TVariables, context?: TContext) => void;

  /**
   * Optional success handler
   */
  onSuccess?: (data: TData, variables: TVariables, context?: TContext) => void;

  /**
   * Optional settled handler (runs after success or error)
   */
  onSettled?: (
    data: TData | undefined,
    error: Error | null,
    variables: TVariables,
    context?: TContext,
  ) => void;

  /**
   * Additional query keys to invalidate on success
   */
  invalidateKeys?: readonly unknown[][];

  /**
   * Whether to show success message (default: false)
   */
  showSuccessMessage?: boolean;

  /**
   * Custom success message
   */
  successMessage?: string;

  /**
   * Whether to show error alert (default: true)
   */
  showErrorAlert?: boolean;
}

/**
 * Result of an optimistic mutation
 */
export interface OptimisticMutationResult<TVariables> {
  /**
   * Execute the mutation
   */
  mutate: (variables: TVariables) => Promise<void>;

  /**
   * Whether the mutation is currently loading
   */
  isLoading: boolean;

  /**
   * Whether the mutation succeeded
   */
  isSuccess: boolean;

  /**
   * Whether the mutation failed
   */
  isError: boolean;

  /**
   * Error if mutation failed
   */
  error: Error | null;

  /**
   * Reset mutation state
   */
  reset: () => void;
}

/**
 * Hook for creating mutations with built-in optimistic updates and error handling.
 *
 * This hook provides a standardized way to handle mutations with:
 * - Automatic cache updates
 * - Rollback on error
 * - Query invalidation
 * - Error handling with user-friendly messages
 * - Loading states
 *
 * @param mutationFn - The async function that performs the mutation
 * @param config - Configuration for optimistic updates and error handling
 *
 * @example
 * ```typescript
 * const updateActivity = useOptimisticMutation(
 *   async (variables: { id: string; name: string }) => {
 *     return await api.updateActivity(variables);
 *   },
 *   {
 *     queryKey: queryKeys.activities.detail(activityId),
 *     updater: (old, variables) => ({
 *       ...old,
 *       name: variables.name,
 *     }),
 *     invalidateKeys: [queryKeys.activities.lists()],
 *     successMessage: "Activity updated!",
 *   }
 * );
 *
 * // In component
 * <Button
 *   onPress={() => updateActivity.mutate({ id: "123", name: "New Name" })}
 *   loading={updateActivity.isLoading}
 * />
 * ```
 */
export function useOptimisticMutation<TData, TVariables, TContext = unknown>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  config: OptimisticMutationConfig<TData, TVariables, TContext>,
): OptimisticMutationResult<TVariables> {
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const reset = useCallback(() => {
    setIsLoading(false);
    setIsSuccess(false);
    setIsError(false);
    setError(null);
  }, []);

  const mutate = useCallback(
    async (variables: TVariables) => {
      setIsLoading(true);
      setIsSuccess(false);
      setIsError(false);
      setError(null);

      let context: TContext | undefined;

      try {
        // 1. Cancel any outgoing refetches
        await queryClient.cancelQueries({ queryKey: config.queryKey });

        // 2. Snapshot the previous value
        const previousData = queryClient.getQueryData<TData>(config.queryKey);

        // 3. Optimistically update the cache
        queryClient.setQueryData<TData>(config.queryKey, (old) =>
          config.updater(old, variables),
        );

        // Create context for callbacks
        context = { previousData } as TContext;

        // 4. Perform the mutation
        const data = await mutationFn(variables);

        // 5. Update with server response
        queryClient.setQueryData<TData>(config.queryKey, data);

        // 6. Invalidate related queries
        if (config.invalidateKeys) {
          await Promise.all(
            config.invalidateKeys.map((key) =>
              queryClient.invalidateQueries({ queryKey: key }),
            ),
          );
        }

        // 7. Call success handler
        if (config.onSuccess) {
          config.onSuccess(data, variables, context);
        }

        // 8. Show success message
        if (config.showSuccessMessage && config.successMessage) {
          Alert.alert("Success", config.successMessage);
        }

        setIsSuccess(true);
        setIsLoading(false);
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Unknown error");

        // Rollback optimistic update
        if (context && (context as any).previousData !== undefined) {
          queryClient.setQueryData<TData>(
            config.queryKey,
            (context as any).previousData,
          );
        }

        // Call error handler
        if (config.onError) {
          config.onError(error, variables, context);
        } else if (config.showErrorAlert !== false) {
          // Default error handling with user-friendly message
          showErrorAlert(error);
        }

        setIsError(true);
        setError(error);
        setIsLoading(false);

        // Re-throw for caller to handle if needed
        throw error;
      } finally {
        // Call settled handler
        if (config.onSettled) {
          const data = queryClient.getQueryData<TData>(config.queryKey);
          config.onSettled(data, error, variables, context);
        }
      }
    },
    [queryClient, config, mutationFn],
  );

  return {
    mutate,
    isLoading,
    isSuccess,
    isError,
    error,
    reset,
  };
}

/**
 * Hook for creating mutations with automatic query invalidation (no optimistic updates).
 *
 * Simpler than useOptimisticMutation - just invalidates queries after success.
 *
 * @param mutationFn - The async function that performs the mutation
 * @param config - Configuration for query invalidation and error handling
 *
 * @example
 * ```typescript
 * const deleteActivity = useInvalidatingMutation(
 *   async (id: string) => {
 *     return await api.deleteActivity(id);
 *   },
 *   {
 *     invalidateKeys: [
 *       queryKeys.activities.lists(),
 *       queryKeys.activities.detail(activityId),
 *     ],
 *     successMessage: "Activity deleted!",
 *   }
 * );
 * ```
 */
export function useInvalidatingMutation<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  config: {
    invalidateKeys: readonly unknown[][];
    onSuccess?: (data: TData, variables: TVariables) => void;
    onError?: (error: Error, variables: TVariables) => void;
    showSuccessMessage?: boolean;
    successMessage?: string;
    showErrorAlert?: boolean;
  },
): OptimisticMutationResult<TVariables> {
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const reset = useCallback(() => {
    setIsLoading(false);
    setIsSuccess(false);
    setIsError(false);
    setError(null);
  }, []);

  const mutate = useCallback(
    async (variables: TVariables) => {
      setIsLoading(true);
      setIsSuccess(false);
      setIsError(false);
      setError(null);

      try {
        // Perform the mutation
        const data = await mutationFn(variables);

        // Invalidate queries
        await Promise.all(
          config.invalidateKeys.map((key) =>
            queryClient.invalidateQueries({ queryKey: key }),
          ),
        );

        // Call success handler
        if (config.onSuccess) {
          config.onSuccess(data, variables);
        }

        // Show success message
        if (config.showSuccessMessage && config.successMessage) {
          Alert.alert("Success", config.successMessage);
        }

        setIsSuccess(true);
        setIsLoading(false);
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Unknown error");

        // Call error handler
        if (config.onError) {
          config.onError(error, variables);
        } else if (config.showErrorAlert !== false) {
          // Default error handling with user-friendly message
          showErrorAlert(error);
        }

        setIsError(true);
        setError(error);
        setIsLoading(false);

        throw error;
      }
    },
    [queryClient, config, mutationFn],
  );

  return {
    mutate,
    isLoading,
    isSuccess,
    isError,
    error,
    reset,
  };
}

/**
 * Hook for creating mutations with automatic list item addition.
 *
 * Optimistically adds an item to a list, then updates with server response.
 *
 * @example
 * ```typescript
 * const createActivity = useListAddMutation(
 *   async (data: CreateActivityInput) => {
 *     return await api.createActivity(data);
 *   },
 *   {
 *     listQueryKey: queryKeys.activities.lists(),
 *     optimisticItem: (variables) => ({
 *       id: "temp-" + Date.now(),
 *       ...variables,
 *       created_at: new Date().toISOString(),
 *     }),
 *     successMessage: "Activity created!",
 *   }
 * );
 * ```
 */
export function useListAddMutation<
  TData extends { id: string },
  TVariables,
  TListData extends { items: TData[]; total: number },
>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  config: {
    listQueryKey: readonly unknown[];
    optimisticItem: (variables: TVariables) => TData;
    invalidateKeys?: readonly unknown[][];
    onSuccess?: (data: TData, variables: TVariables) => void;
    onError?: (error: Error, variables: TVariables) => void;
    showSuccessMessage?: boolean;
    successMessage?: string;
    showErrorAlert?: boolean;
  },
): OptimisticMutationResult<TVariables> {
  return useOptimisticMutation<TListData, TVariables>(mutationFn as any, {
    queryKey: config.listQueryKey,
    updater: (old, variables) => {
      if (!old) return undefined as unknown as TListData;

      const optimisticItem = config.optimisticItem(variables);

      return {
        ...old,
        items: [optimisticItem, ...old.items],
        total: old.total + 1,
      };
    },
    invalidateKeys: config.invalidateKeys,
    onSuccess: config.onSuccess as any,
    onError: config.onError,
    showSuccessMessage: config.showSuccessMessage,
    successMessage: config.successMessage,
    showErrorAlert: config.showErrorAlert,
  });
}

/**
 * Hook for creating mutations with automatic list item removal.
 *
 * @example
 * ```typescript
 * const deleteActivity = useListRemoveMutation(
 *   async (id: string) => {
 *     await api.deleteActivity(id);
 *   },
 *   {
 *     listQueryKey: queryKeys.activities.lists(),
 *     getItemId: (id) => id,
 *     successMessage: "Activity deleted!",
 *   }
 * );
 * ```
 */
export function useListRemoveMutation<
  TVariables,
  TData extends { id: string },
  TListData extends { items: TData[]; total: number },
>(
  mutationFn: (variables: TVariables) => Promise<void>,
  config: {
    listQueryKey: readonly unknown[];
    getItemId: (variables: TVariables) => string;
    invalidateKeys?: readonly unknown[][];
    onSuccess?: (variables: TVariables) => void;
    onError?: (error: Error, variables: TVariables) => void;
    showSuccessMessage?: boolean;
    successMessage?: string;
    showErrorAlert?: boolean;
  },
): OptimisticMutationResult<TVariables> {
  return useOptimisticMutation<TListData, TVariables>(mutationFn as any, {
    queryKey: config.listQueryKey,
    updater: (old, variables) => {
      if (!old) return undefined as unknown as TListData;

      const itemId = config.getItemId(variables);

      return {
        ...old,
        items: old.items.filter((item) => item.id !== itemId),
        total: old.total - 1,
      };
    },
    invalidateKeys: config.invalidateKeys,
    onSuccess: config.onSuccess as any,
    onError: config.onError,
    showSuccessMessage: config.showSuccessMessage,
    successMessage: config.successMessage,
    showErrorAlert: config.showErrorAlert,
  });
}
