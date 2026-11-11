import Constants from "expo-constants";
import { PostHogProvider, usePostHog } from "posthog-react-native";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { useProductAnalyticsConsent } from "@/lib/stores/productAnalyticsConsentStore";

const extra = Constants.expoConfig?.extra ?? {};

function ProductAnalyticsConsentSynchronizer() {
  const posthog = usePostHog();
  const { consent, hasHydrated } = useProductAnalyticsConsent();

  useEffect(() => {
    // Keep the SDK denied while the persisted app preference is unknown.
    void (hasHydrated && consent === "granted" ? posthog.optIn() : posthog.optOut());
  }, [consent, hasHydrated, posthog]);

  return null;
}

export function TelemetryProvider({ children }: { children: ReactNode }) {
  const { consent, hasHydrated } = useProductAnalyticsConsent();
  const posthogKey = extra.posthogKey ?? process.env.EXPO_PUBLIC_POSTHOG_KEY;
  const posthogHost = extra.posthogHost ?? process.env.EXPO_PUBLIC_POSTHOG_HOST;

  if (!posthogKey) {
    return children;
  }

  return (
    <PostHogProvider
      apiKey={String(posthogKey)}
      autocapture={{
        captureScreens: false,
        captureTouches: false,
      }}
      debug={__DEV__ && process.env.EXPO_PUBLIC_POSTHOG_DEBUG === "1"}
      options={{
        captureAppLifecycleEvents: false,
        defaultOptIn: false,
        disabled: !hasHydrated || consent !== "granted",
        host: String(posthogHost || "https://us.i.posthog.com"),
      }}
    >
      <ProductAnalyticsConsentSynchronizer />
      {children}
    </PostHogProvider>
  );
}
