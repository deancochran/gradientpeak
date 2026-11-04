import { PostHogProvider } from "@posthog/react";
import { invalidateProfileIdentityQueries } from "@repo/api/profile-identity-cache";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";

import { api, type createApiClient } from "../../lib/api/client";
import { posthogOptions, posthogProjectToken } from "../../lib/telemetry";

import { AuthProvider } from "./auth-provider";
import { ThemeProvider } from "./theme-provider";

export function AppProviders({
  children,
  queryClient,
  apiClient,
}: {
  children: React.ReactNode;
  queryClient: QueryClient;
  apiClient: ReturnType<typeof createApiClient>;
}) {
  return (
    <MaybePostHogProvider>
      <QueryClientProvider client={queryClient}>
        <api.Provider client={apiClient} queryClient={queryClient}>
          <ThemeProvider>
            <ProfileIdentityFocusRefresh>
              <AuthProvider>{children}</AuthProvider>
            </ProfileIdentityFocusRefresh>
          </ThemeProvider>
        </api.Provider>
      </QueryClientProvider>
    </MaybePostHogProvider>
  );
}

function ProfileIdentityFocusRefresh({ children }: { children: React.ReactNode }) {
  const utils = api.useUtils();

  useEffect(() => {
    const refreshProfileIdentity = () => {
      void invalidateProfileIdentityQueries(utils);
    };

    window.addEventListener("focus", refreshProfileIdentity);
    return () => window.removeEventListener("focus", refreshProfileIdentity);
  }, [utils]);

  return children;
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
