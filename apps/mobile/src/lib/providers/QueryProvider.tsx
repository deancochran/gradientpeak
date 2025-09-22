import { createQueryClient } from "@repo/trpc/client";
import {
    focusManager,
    onlineManager,
    QueryClientProvider,
} from "@tanstack/react-query";
import * as Network from "expo-network";
import * as React from "react";
import { Alert, AppState, Platform } from "react-native";
import { createTRPCClient, trpc } from "../trpc";

const queryClient = createQueryClient();

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

    queryClient.getMutationCache().config.onError = (error) => {
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
