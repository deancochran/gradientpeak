import { PostHogProvider } from "@posthog/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { api, createApiClient, getQueryClient } from "../../lib/api/client";
import { ensureCurrentBrowserContractEpoch } from "../../lib/contract-epoch";
import { posthogOptions, posthogProjectToken } from "../../lib/telemetry";

import { AuthProvider } from "./auth-provider";
import { ThemeProvider } from "./theme-provider";

let reactScanEnabled = false;

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [bootstrapState, setBootstrapState] = useState<"checking" | "ready" | "blocked">(
    "checking",
  );

  const bootstrap = () => {
    setBootstrapState("checking");
    void ensureCurrentBrowserContractEpoch().then(
      () => setBootstrapState("ready"),
      () => setBootstrapState("blocked"),
    );
  };

  useEffect(bootstrap, []);

  if (bootstrapState !== "ready") {
    return (
      <ContractEpochBootstrapState blocked={bootstrapState === "blocked"} onRetry={bootstrap} />
    );
  }

  return <ReadyAppProviders>{children}</ReadyAppProviders>;
}

function ReadyAppProviders({ children }: { children: React.ReactNode }) {
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

function ContractEpochBootstrapState({
  blocked,
  onRetry,
}: {
  blocked: boolean;
  onRetry: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <section aria-live="assertive" className="max-w-md space-y-3 text-center">
        <h1 className="text-xl font-semibold">
          {blocked ? "Update blocked" : "Preparing GradientPeak"}
        </h1>
        <p className="text-muted-foreground">
          {blocked
            ? "Close other GradientPeak tabs, then retry the required local update."
            : "Preparing your local workspace."}
        </p>
        {blocked ? (
          <button
            className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
            onClick={onRetry}
            type="button"
          >
            Retry update
          </button>
        ) : null}
      </section>
    </main>
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
