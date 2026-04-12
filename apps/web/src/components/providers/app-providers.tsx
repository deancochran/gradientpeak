import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import { api, createApiClient, getQueryClient } from "../../lib/api/client";

import { AuthProvider } from "./auth-provider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  const [apiClient] = useState(() => createApiClient());

  return (
    <QueryClientProvider client={queryClient}>
      <api.Provider client={apiClient} queryClient={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </api.Provider>
    </QueryClientProvider>
  );
}
