import { waitFor } from "@testing-library/react-native";
import React from "react";
import { createHost } from "../../../test/mock-components";
import { renderNative, screen } from "../../../test/render-native";
import { AppBootstrapGate } from "../AppBootstrapGate";

const authState = {
  authState: "authenticated-verified",
  onboardingStatus: "completed",
  isFullyLoaded: true,
  user: { id: "user-1", email: "athlete@example.com" },
  profileLoading: false,
  profileError: null,
  refreshProfile: jest.fn(async () => undefined),
};
let segmentsValue = ["(internal)", "(standard)", "onboarding"];
let pathnameValue = "/onboarding";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  ActivityIndicator: createHost("ActivityIndicator"),
  View: createHost("View"),
}));
jest.mock("expo-router", () => ({
  Redirect: ({ href }: { href: unknown }) =>
    React.createElement("Text", { testID: "redirect-target" }, JSON.stringify(href)),
  usePathname: () => pathnameValue,
  useSegments: () => segmentsValue,
}));
jest.mock("@repo/ui/components/button", () => ({ Button: createHost("Button") }));
jest.mock("@repo/ui/components/text", () => ({ Text: createHost("Text") }));
jest.mock("@/lib/hooks/useAuth", () => ({ useAuth: () => authState }));
jest.mock("@/lib/server-config", () => ({ useServerConfig: () => ({ initialized: true }) }));
jest.mock("@/lib/stores/auth-store", () => ({
  useAuthStore: (selector: (state: { clearSession: () => Promise<void> }) => unknown) =>
    selector({ clearSession: jest.fn(async () => undefined) }),
}));

describe("AppBootstrapGate onboarding status", () => {
  beforeEach(() => {
    authState.authState = "authenticated-verified";
    authState.onboardingStatus = "completed";
    pathnameValue = "/onboarding";
    segmentsValue = ["(internal)", "(standard)", "onboarding"];
  });

  it("preserves an internal protected destination when redirecting an anonymous user to sign in", async () => {
    authState.authState = "anonymous";
    pathnameValue = "/integrations";
    segmentsValue = ["(internal)", "(standard)", "integrations"];

    await renderNative(
      <AppBootstrapGate>{React.createElement("Text", null, "content")}</AppBootstrapGate>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("redirect-target").props.children).toContain(
        '"returnTo":"/integrations"',
      ),
    );
  });

  it("redirects completed users away from onboarding", async () => {
    await renderNative(
      <AppBootstrapGate>{React.createElement("Text", null, "content")}</AppBootstrapGate>,
    );
    await waitFor(() => expect(screen.getByTestId("redirect-target")).toBeTruthy());
  });

  it("redirects an authenticated external route to the explicit internal home", async () => {
    pathnameValue = "/sign-in";
    segmentsValue = ["(external)", "sign-in"];

    await renderNative(
      <AppBootstrapGate>{React.createElement("Text", null, "content")}</AppBootstrapGate>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("redirect-target").props.children).toBe('"/(internal)/(tabs)"'),
    );
  });

  it.each([
    "provider_selection",
    "processing",
    "review",
  ])("keeps %s users in onboarding", async (status) => {
    authState.onboardingStatus = status;
    await renderNative(
      <AppBootstrapGate>
        {React.createElement("Text", null, "Onboarding content")}
      </AppBootstrapGate>,
    );
    await waitFor(() => expect(screen.getByText("Onboarding content")).toBeTruthy());
    expect(screen.queryByTestId("redirect-target")).toBeNull();
  });
});
