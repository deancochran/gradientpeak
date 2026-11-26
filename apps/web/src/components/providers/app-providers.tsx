import { PostHogProvider } from "@posthog/react";
import { invalidateProfileIdentityQueries } from "@repo/api/profile-identity-cache";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PostHogInterface } from "posthog-js";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { api, type createApiClient } from "../../lib/api/client";
import { posthogOptions, posthogProjectToken } from "../../lib/telemetry";

import { ThemeProvider } from "./theme-provider";

const productAnalyticsConsentStorageKey = "gradientpeak-product-analytics-consent";
type ProductAnalyticsProviderStatus = "initializing" | "ready" | "unavailable";
const ProductAnalyticsProviderStatusContext =
  createContext<ProductAnalyticsProviderStatus>("unavailable");
type PostHogConsentClient = PostHogInterface & {
  opt_in_capturing: (options: { captureEventName: false }) => void;
};

function hasStoredProductAnalyticsConsent() {
  try {
    return window.localStorage.getItem(productAnalyticsConsentStorageKey) === "granted";
  } catch {
    return false;
  }
}

function reconcileProductAnalyticsConsent(posthog: PostHogInterface) {
  try {
    if (hasStoredProductAnalyticsConsent()) {
      (posthog as PostHogConsentClient).opt_in_capturing({ captureEventName: false });
    } else {
      posthog.opt_out_capturing();
    }
  } catch {
    // A storage or SDK failure stays opted out by the initialized SDK default.
  }
}

export function useProductAnalyticsProviderStatus() {
  return useContext(ProductAnalyticsProviderStatusContext);
}

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
            <ProfileIdentityFocusRefresh>{children}</ProfileIdentityFocusRefresh>
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
  const [isReady, setIsReady] = useState(false);
  const options = useMemo(
    () => ({
      ...posthogOptions,
      loaded: (posthog: PostHogInterface) => {
        reconcileProductAnalyticsConsent(posthog);
        posthogOptions.loaded?.(posthog);
        setIsReady(true);
      },
    }),
    [],
  );

  if (!posthogProjectToken) {
    return (
      <ProductAnalyticsProviderStatusContext.Provider value="unavailable">
        {children}
      </ProductAnalyticsProviderStatusContext.Provider>
    );
  }

  return (
    <PostHogProvider apiKey={posthogProjectToken} options={options}>
      <ProductAnalyticsProviderStatusContext.Provider value={isReady ? "ready" : "initializing"}>
        {children}
      </ProductAnalyticsProviderStatusContext.Provider>
    </PostHogProvider>
  );
}
