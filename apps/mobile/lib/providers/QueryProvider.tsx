import { createQueryClient } from "@repo/trpc/client";
import {
  focusManager,
  onlineManager,
  QueryClientProvider,
} from "@tanstack/react-query";
import * as Network from "expo-network";
import { router } from "expo-router";
import * as React from "react";
import { Alert, AppState, Platform } from "react-native";
import { useAuthStore } from "../stores/auth-store";
import { createTRPCClient, trpc } from "../trpc";

const queryClient = createQueryClient();

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
    console.log("🚨 Unauthorized error detected, clearing session...");
    // Prevent infinite loops by checking if we're already logged out
    const { session } = useAuthStore.getState();
    if (session) {
      useAuthStore.getState().clearSession();
      // Use setImmediate to ensure we're out of the current render cycle
      setTimeout(() => {
        router.replace("/(external)/sign-in");
      }, 0);
    }
  }
};

export const setupNetworkListener = () => {
  const unsubscribe = onlineManager.setEventListener((setOnline) => {
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
  const trpcClient = React.useMemo(() => createTRPCClient(), []);

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
      handleGlobalError(error);
      originalQueryOnError?.(...args);
    };

    mutationCache.config.onError = (...args) => {
      const [error] = args;
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
  }, []);

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
