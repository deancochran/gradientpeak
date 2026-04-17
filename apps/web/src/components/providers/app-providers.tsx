import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { api, createApiClient, getQueryClient } from "../../lib/api/client";

import { AuthProvider } from "./auth-provider";

let reactScanEnabled = false;

export function AppProviders({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  const [apiClient] = useState(() => createApiClient());

  useEffect(() => {
    if (
      !import.meta.env.DEV ||
      import.meta.env.VITE_ENABLE_REACT_SCAN !== "1" ||
      reactScanEnabled
    ) {
      return;
    }

    reactScanEnabled = true;

    void import("react-scan").then(({ scan }) => {
      scan({
        enabled: true,
        showToolbar: true,
      });
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <api.Provider client={apiClient} queryClient={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </api.Provider>
    </QueryClientProvider>
  );
}
