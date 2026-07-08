import Constants from "expo-constants";
import { PostHogProvider } from "posthog-react-native";
import type { ReactNode } from "react";

const extra = Constants.expoConfig?.extra ?? {};

export function TelemetryProvider({ children }: { children: ReactNode }) {
  const posthogKey = extra.posthogKey ?? process.env.EXPO_PUBLIC_POSTHOG_KEY;
  const posthogHost = extra.posthogHost ?? process.env.EXPO_PUBLIC_POSTHOG_HOST;

  if (!posthogKey) {
    return children;
  }

  return (
    <PostHogProvider
      apiKey={String(posthogKey)}
      autocapture={{
        captureScreens: true,
        captureTouches: false,
      }}
      debug={__DEV__ && process.env.EXPO_PUBLIC_POSTHOG_DEBUG === "1"}
      options={{
        host: String(posthogHost || "https://us.i.posthog.com"),
      }}
    >
      {children}
    </PostHogProvider>
  );
}
