import { PostHogProvider } from "@posthog/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { api, createApiClient, getQueryClient } from "../../lib/api/client";
import { posthogOptions, posthogProjectToken } from "../../lib/telemetry";

import { AuthProvider } from "./auth-provider";
import { ThemeProvider } from "./theme-provider";

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
    <MaybePostHogProvider>
      <QueryClientProvider client={queryClient}>
        <api.Provider client={apiClient} queryClient={queryClient}>
          <ThemeProvider>
            <AuthProvider>{children}</AuthProvider>
          </ThemeProvider>
        </api.Provider>
      </QueryClientProvider>
    </MaybePostHogProvider>
  );
}

function MaybePostHogProvider({ children }: { children: React.ReactNode }) {
  if (!posthogProjectToken) {
    return children;
  }

  return (
    <PostHogProvider apiKey={posthogProjectToken} options={posthogOptions}>
      {children}
    </PostHogProvider>
  );
}
