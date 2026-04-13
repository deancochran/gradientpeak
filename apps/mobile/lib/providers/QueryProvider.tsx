import { createQueryClient } from "@repo/api/react";
import { focusManager, onlineManager, QueryClientProvider } from "@tanstack/react-query";
import * as Network from "expo-network";
import * as React from "react";
import { Alert, AppState, Platform } from "react-native";
import { api, createApiClient } from "../api";
import { useServerConfig } from "../server-config";
import { useAuthStore } from "../stores/auth-store";
import { captureE2EQueryError } from "../testing/e2eRuntimeErrors";

// Global error handler for 401/Unauthorized errors
const handleGlobalError = (error: unknown) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const isUnauthorized =
    errorMessage.includes("UNAUTHORIZED") ||
    errorMessage.includes("Unauthorized") ||
    (typeof error === "object" &&
      error !== null &&
      "data" in error &&
      (error as any).data?.code === "UNAUTHORIZED");

  if (isUnauthorized) {
    const { session } = useAuthStore.getState();
    if (session) {
      void useAuthStore.getState().clearSession();
    }
  }
};

export const setupNetworkListener = () => {
  const unsubscribe = onlineManager.setEventListener((setOnline) => {
    void Network.getNetworkStateAsync().then((state) => {
      setOnline(Boolean(state.isConnected));
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

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const { version } = useServerConfig();
  const queryClient = React.useMemo(() => createQueryClient(), [version]);
  const apiClient = React.useMemo(() => createApiClient(), [version]);

  React.useEffect(() => {
    const cleanupNetwork = setupNetworkListener();
    const cleanupFocus = setupFocusManager();

    // Set up global error handlers for queries and mutations
    const queryCache = queryClient.getQueryCache();
    const mutationCache = queryClient.getMutationCache();

    // Preserve existing handlers if any, but wrap them
    const originalQueryOnError = queryCache.config.onError;
    const originalMutationOnError = mutationCache.config.onError;

    queryCache.config.onError = (...args) => {
      const [error] = args;
      captureE2EQueryError(error, "query_cache");
      handleGlobalError(error);
      originalQueryOnError?.(...args);
    };

    mutationCache.config.onError = (...args) => {
      const [error] = args;
      captureE2EQueryError(error, "mutation_cache");
      handleGlobalError(error);
      if (error instanceof Error) {
        // Only show alert for non-auth errors, or if we want to be explicit
        // For auth errors, the redirect is usually enough
        if (!error.message.includes("UNAUTHORIZED")) {
          Alert.alert("Error", error.message);
        }
      }
      originalMutationOnError?.(...args);
    };

    return () => {
      // @ts-expect-error network cleanup type issue
      cleanupNetwork?.();
      cleanupFocus?.();
    };
  }, [queryClient]);

  return (
    <api.Provider client={apiClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </api.Provider>
  );
}
