import {
  QueryClient,
  QueryClientProvider,
  focusManager,
  onlineManager,
} from "@tanstack/react-query";
import * as Network from "expo-network";
import * as React from "react";
import { AppState, Platform } from "react-native";

const queryClient = new QueryClient();

// Setup React Query for React Native
onlineManager.setEventListener((setOnline) => {
  const subscription = Network.addNetworkStateListener((state) => {
    setOnline(!!state.isConnected);
  });
  return () => subscription.remove();
});

const onAppStateChange = (status: string) => {
  if (Platform.OS !== "web") {
    focusManager.setFocused(status === "active");
  }
};

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [trpcClient] = React.useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url:
            process.env.EXPO_PUBLIC_API_URL + "/api/trpc" ||
            "http://localhost:3000/api/trpc",
          async headers() {
            const { data } = await supabase.auth.getSession();
            const token = data.session?.access_token;

            return {
              authorization: token ? `Bearer ${token}` : "",
            };
          },
        }),
      ],
    }),
  );

  React.useEffect(() => {
    const subscription = AppState.addEventListener("change", onAppStateChange);
    return () => subscription.remove();
  }, []);

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
