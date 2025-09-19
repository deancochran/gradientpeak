import { QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import { Alert } from "react-native";

import { createQueryClient } from "@repo/trpc/client";
import { logError } from "../services/error-tracking";
import {
  setupFocusManager,
  setupNetworkListener,
} from "../services/react-query-setup";
import { createTRPCClient, trpc } from "../trpc";
const queryClient = createQueryClient();

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const trpcClient = React.useMemo(() => createTRPCClient(), []);

  React.useEffect(() => {
    const cleanupNetwork = setupNetworkListener();
    const cleanupFocus = setupFocusManager();

    // Global error handlers for React Query
    queryClient.getQueryCache().config.onError = (error) => {
      logError(error as Error, "Query");
    };

    queryClient.getMutationCache().config.onError = (error) => {
      logError(error as Error, "Mutation");
      if (error instanceof Error) {
        Alert.alert("Error", error.message);
      }
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
