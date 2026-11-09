import React from "react";
import { renderNative } from "../../test/render-native";

const optIn = jest.fn();
const optOut = jest.fn();
let consent = "denied";
let hasHydrated = false;
let providerProps: Record<string, unknown> | undefined;

jest.mock("expo-constants", () => ({ expoConfig: { extra: { posthogKey: "test-key" } } }));
jest.mock("posthog-react-native", () => ({
  PostHogProvider: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
    providerProps = props;
    return children;
  },
  usePostHog: () => ({ optIn, optOut }),
}));
jest.mock("@/lib/stores/productAnalyticsConsentStore", () => ({
  useProductAnalyticsConsent: () => ({ consent, hasHydrated, setConsent: jest.fn() }),
}));

const { TelemetryProvider } = require("./TelemetryProvider");

describe("TelemetryProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    consent = "denied";
    hasHydrated = false;
  });

  it("is default-denied and keeps the SDK opted out before hydration", async () => {
    await renderNative(
      <TelemetryProvider>
        <React.Fragment />
      </TelemetryProvider>,
    );

    expect(providerProps).toMatchObject({
      autocapture: { captureScreens: false, captureTouches: false },
      options: { captureAppLifecycleEvents: false, defaultOptIn: false },
    });
    expect(optIn).not.toHaveBeenCalled();
    expect(optOut).toHaveBeenCalledTimes(1);
  });

  it("synchronizes persisted opt-in and opt-out preferences", async () => {
    consent = "granted";
    hasHydrated = true;
    await renderNative(
      <TelemetryProvider>
        <React.Fragment />
      </TelemetryProvider>,
    );
    expect(optIn).toHaveBeenCalledTimes(1);

    jest.clearAllMocks();
    consent = "denied";
    await renderNative(
      <TelemetryProvider>
        <React.Fragment />
      </TelemetryProvider>,
    );
    expect(optOut).toHaveBeenCalledTimes(1);
  });
});
