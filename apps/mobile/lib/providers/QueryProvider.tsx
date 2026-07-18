import { createQueryClient } from "@repo/api/react";
import { focusManager, onlineManager, QueryClientProvider } from "@tanstack/react-query";
import * as Network from "expo-network";
import * as React from "react";
import { AppState, Platform } from "react-native";
import { api, createApiClient } from "../api";
import { useServerConfig } from "../server-config";
import { useAuthStore } from "../stores/auth-store";
import { captureE2EQueryError } from "../testing/e2eRuntimeErrors";

const isUnauthorizedError = (error: unknown) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorData =
    typeof error === "object" && error !== null && "data" in error && error.data
      ? error.data
      : null;
  return (
    errorMessage.includes("UNAUTHORIZED") ||
    errorMessage.includes("Unauthorized") ||
    (typeof errorData === "object" &&
      errorData !== null &&
      "code" in errorData &&
      errorData.code === "UNAUTHORIZED")
  );
};

// Global error handler for 401/Unauthorized errors
const handleGlobalError = (error: unknown) => {
  if (isUnauthorizedError(error)) {
    const { session } = useAuthStore.getState();
    if (session) {
      void useAuthStore.getState().clearSession();
    }
  }
};

export const setupNetworkListener = () => {
  const unsubscribe = onlineManager.setEventListener((setOnline) => {
    void Network.getNetworkStateAsync()
      .then((state) => {
        setOnline(Boolean(state.isConnected));
      })
      .catch((error) => {
        console.warn(
          "[QueryProvider] Failed to read initial network state; waiting for a network update",
          error,
        );
      });
    const subscription = Network.addNetworkStateListener((state) => {
      setOnline(!!state.isConnected);
    });
    return () => subscription?.remove();
  });

  return unsubscribe;
};

export const setupFocusManager = () => {
  const onAppStateChange = (status: string) => {
    if (Platform.OS !== "web") {
      focusManager.setFocused(status === "active");
    }
  };

  const subscription = AppState.addEventListener("change", onAppStateChange);
  return () => subscription?.remove();
};

type QueryClientCacheOwner = Pick<
  ReturnType<typeof createQueryClient>,
  "getMutationCache" | "getQueryCache"
>;

export function setupCacheErrorHandlers(queryClient: QueryClientCacheOwner) {
  const queryCache = queryClient.getQueryCache();
  const mutationCache = queryClient.getMutationCache();
  const originalQueryOnError = queryCache.config.onError;
  const originalMutationOnError = mutationCache.config.onError;

  const queryOnError: NonNullable<typeof queryCache.config.onError> = (...args) => {
    const [error] = args;
    captureE2EQueryError(error, "query_cache");
    handleGlobalError(error);
    originalQueryOnError?.(...args);
  };
  const mutationOnError: NonNullable<typeof mutationCache.config.onError> = (...args) => {
    const [error] = args;
    captureE2EQueryError(error, "mutation_cache");
    handleGlobalError(error);
    originalMutationOnError?.(...args);
  };

  queryCache.config.onError = queryOnError;
  mutationCache.config.onError = mutationOnError;

  return () => {
    if (queryCache.config.onError === queryOnError) {
      if (originalQueryOnError) {
        queryCache.config.onError = originalQueryOnError;
      } else {
        delete queryCache.config.onError;
      }
    }
    if (mutationCache.config.onError === mutationOnError) {
      if (originalMutationOnError) {
        mutationCache.config.onError = originalMutationOnError;
      } else {
        delete mutationCache.config.onError;
      }
    }
  };
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const { version } = useServerConfig();
  const queryClient = React.useMemo(() => {
    void version;
    return createQueryClient();
  }, [version]);
  const apiClient = React.useMemo(() => {
    void version;
    return createApiClient();
  }, [version]);

  React.useEffect(() => {
    const cleanupNetwork = setupNetworkListener();
    const cleanupFocus = setupFocusManager();
    const cleanupCacheErrorHandlers = setupCacheErrorHandlers(queryClient);

    return () => {
      // @ts-expect-error network cleanup type issue
      cleanupNetwork?.();
      cleanupFocus?.();
      cleanupCacheErrorHandlers();
    };
  }, [queryClient]);

  return (
    <api.Provider client={apiClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </api.Provider>
  );
}
