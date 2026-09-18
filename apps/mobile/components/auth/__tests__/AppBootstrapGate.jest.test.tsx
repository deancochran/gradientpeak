import { waitFor } from "@testing-library/react-native";
import React from "react";
import { createHost } from "../../../test/mock-components";
import { renderNative, screen } from "../../../test/render-native";
import { AppBootstrapGate } from "../AppBootstrapGate";

const authState = {
  authState: "authenticated-verified",
  onboardingStatus: "completed" as string | null,
  isFullyLoaded: true,
  user: { id: "user-1", email: "athlete@example.com" },
  profileLoading: false,
  profileError: null as Error | null,
  refreshProfile: jest.fn(async () => undefined),
};
let segmentsValue = ["(internal)", "(standard)", "onboarding"];
let pathnameValue = "/onboarding";
const runtimeGlobal = globalThis as typeof globalThis & { __DEV__?: boolean };
const originalDev = runtimeGlobal.__DEV__;
const originalE2E = process.env.EXPO_PUBLIC_MAESTRO_E2E;

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
    authState.isFullyLoaded = true;
    authState.profileLoading = false;
    authState.profileError = null;
    pathnameValue = "/onboarding";
    segmentsValue = ["(internal)", "(standard)", "onboarding"];
    runtimeGlobal.__DEV__ = false;
    delete process.env.EXPO_PUBLIC_MAESTRO_E2E;
  });

  afterAll(() => {
    if (originalDev === undefined) {
      delete runtimeGlobal.__DEV__;
    } else {
      runtimeGlobal.__DEV__ = originalDev;
    }
    if (originalE2E === undefined) {
      delete process.env.EXPO_PUBLIC_MAESTRO_E2E;
    } else {
      process.env.EXPO_PUBLIC_MAESTRO_E2E = originalE2E;
    }
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

  it("redirects an authenticated welcome route to internal home, not root", async () => {
    pathnameValue = "/";
    segmentsValue = ["(external)", "index"];

    await renderNative(
      <AppBootstrapGate>{React.createElement("Text", null, "content")}</AppBootstrapGate>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("redirect-target").props.children).toBe('"/(internal)/(tabs)"'),
    );
  });

  it("redirects an authenticated incomplete profile from welcome to onboarding", async () => {
    authState.onboardingStatus = "processing";
    pathnameValue = "/";
    segmentsValue = ["(external)", "index"];

    await renderNative(
      <AppBootstrapGate>{React.createElement("Text", null, "Welcome content")}</AppBootstrapGate>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("redirect-target").props.children).toBe(
        '"/(internal)/(standard)/onboarding"',
      ),
    );
  });

  it.each([
    ["verify", "/verify"],
    ["callback", "/callback"],
  ])("keeps an unverified user on the %s route without a repeat redirect", async (route, pathname) => {
    authState.authState = "authenticated-unverified";
    pathnameValue = pathname;
    segmentsValue = ["(external)", route];

    const rendered = await renderNative(
      <AppBootstrapGate>{React.createElement("Text", null, "Auth flow content")}</AppBootstrapGate>,
    );

    await waitFor(() => expect(screen.getByText("Auth flow content")).toBeTruthy());
    expect(screen.queryByTestId("redirect-target")).toBeNull();
    rendered.rerender(
      <AppBootstrapGate>{React.createElement("Text", null, "Auth flow content")}</AppBootstrapGate>,
    );
    expect(screen.queryByTestId("redirect-target")).toBeNull();
  });

  it("allows the enabled developer storybook route with real route-group segments", async () => {
    pathnameValue = "/storybook";
    segmentsValue = ["(external)", "storybook"];
    runtimeGlobal.__DEV__ = true;
    process.env.EXPO_PUBLIC_MAESTRO_E2E = "1";

    await renderNative(
      <AppBootstrapGate>{React.createElement("Text", null, "Storybook content")}</AppBootstrapGate>,
    );

    await waitFor(() => expect(screen.getByText("Storybook content")).toBeTruthy());
    expect(screen.queryByTestId("redirect-target")).toBeNull();
  });

  it("keeps a signed-out visitor on the welcome route", async () => {
    authState.authState = "anonymous";
    pathnameValue = "/";
    segmentsValue = ["(external)", "index"];

    await renderNative(
      <AppBootstrapGate>{React.createElement("Text", null, "Welcome content")}</AppBootstrapGate>,
    );

    await waitFor(() => expect(screen.getByText("Welcome content")).toBeTruthy());
    expect(screen.queryByTestId("redirect-target")).toBeNull();
  });

  it("does not redirect while a verified user's profile is loading, then resolves to internal home", async () => {
    authState.onboardingStatus = null;
    authState.profileLoading = true;
    pathnameValue = "/";
    segmentsValue = ["(external)", "index"];

    const rendered = await renderNative(
      <AppBootstrapGate>{React.createElement("Text", null, "Welcome content")}</AppBootstrapGate>,
    );

    expect(screen.queryByTestId("redirect-target")).toBeNull();
    authState.onboardingStatus = "completed";
    authState.profileLoading = false;
    rendered.rerender(
      <AppBootstrapGate>{React.createElement("Text", null, "Welcome content")}</AppBootstrapGate>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("redirect-target").props.children).toBe('"/(internal)/(tabs)"'),
    );
  });

  it("sends a verified user with a settled absent profile to onboarding", async () => {
    authState.onboardingStatus = null;
    pathnameValue = "/";
    segmentsValue = ["(external)", "index"];

    await renderNative(
      <AppBootstrapGate>{React.createElement("Text", null, "Welcome content")}</AppBootstrapGate>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("redirect-target").props.children).toBe(
        '"/(internal)/(standard)/onboarding"',
      ),
    );
  });

  it("does not redirect before session restoration completes", async () => {
    authState.isFullyLoaded = false;
    authState.authState = "anonymous";
    pathnameValue = "/";
    segmentsValue = ["(external)", "index"];

    await renderNative(
      <AppBootstrapGate>{React.createElement("Text", null, "Welcome content")}</AppBootstrapGate>,
    );

    expect(screen.queryByTestId("redirect-target")).toBeNull();
    expect(screen.queryByText("Welcome content")).toBeNull();
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
