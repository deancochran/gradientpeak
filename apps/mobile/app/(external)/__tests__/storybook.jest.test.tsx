import React from "react";

import { renderNative, screen } from "../../../test/render-native";

let searchParams: { surface?: string } = {};

jest.mock("expo-router", () => ({
  __esModule: true,
  router: { replace: jest.fn() },
  useLocalSearchParams: () => searchParams,
}));

jest.mock("@repo/ui/testing/ui-preview", () => ({
  __esModule: true,
  UiPreviewSurface: () => React.createElement("UiPreviewSurface", { testID: "ui-preview-surface" }),
}));

jest.mock("../../../.rnstorybook", () => ({
  __esModule: true,
  default: () => React.createElement("StorybookRoot", { testID: "storybook-root" }),
}));

jest.mock("@/components/dev/MobileCardPreviewSurface", () => ({
  __esModule: true,
  MobileCardPreviewSurface: () =>
    React.createElement("MobileCardPreviewSurface", { testID: "mobile-card-matrix" }),
}));

const StorybookScreen = require("../storybook").default;
const runtimeGlobal = globalThis as typeof globalThis & { __DEV__?: boolean };
const originalDev = runtimeGlobal.__DEV__;
const originalE2E = process.env.EXPO_PUBLIC_MAESTRO_E2E;
const originalStorybook = process.env.EXPO_PUBLIC_STORYBOOK_ENABLED;

function restoreEnv(
  key: "EXPO_PUBLIC_MAESTRO_E2E" | "EXPO_PUBLIC_STORYBOOK_ENABLED",
  value?: string,
) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

describe("Storybook developer route", () => {
  beforeEach(() => {
    runtimeGlobal.__DEV__ = true;
    searchParams = {};
    delete process.env.EXPO_PUBLIC_MAESTRO_E2E;
    delete process.env.EXPO_PUBLIC_STORYBOOK_ENABLED;
  });

  afterAll(() => {
    if (originalDev === undefined) {
      delete runtimeGlobal.__DEV__;
    } else {
      runtimeGlobal.__DEV__ = originalDev;
    }
    restoreEnv("EXPO_PUBLIC_MAESTRO_E2E", originalE2E);
    restoreEnv("EXPO_PUBLIC_STORYBOOK_ENABLED", originalStorybook);
  });

  it("mounts the shared UI preview for the Maestro E2E runtime", () => {
    process.env.EXPO_PUBLIC_MAESTRO_E2E = "1";

    renderNative(<StorybookScreen />);

    expect(screen.getByTestId("ui-preview-surface")).toBeTruthy();
    expect(screen.queryByTestId("storybook-root")).toBeNull();
  });

  it("preserves the on-device Storybook surface outside E2E", () => {
    process.env.EXPO_PUBLIC_STORYBOOK_ENABLED = "1";

    renderNative(<StorybookScreen />);

    expect(screen.getByTestId("storybook-root")).toBeTruthy();
    expect(screen.queryByTestId("ui-preview-surface")).toBeNull();
  });

  it("selects the deterministic mobile card matrix for E2E", () => {
    process.env.EXPO_PUBLIC_MAESTRO_E2E = "1";
    searchParams = { surface: "mobile-cards" };

    renderNative(<StorybookScreen />);

    expect(screen.getByTestId("mobile-card-matrix")).toBeTruthy();
    expect(screen.queryByTestId("ui-preview-surface")).toBeNull();
  });

  it("does not expose either developer surface in production", () => {
    runtimeGlobal.__DEV__ = false;
    process.env.EXPO_PUBLIC_MAESTRO_E2E = "1";
    process.env.EXPO_PUBLIC_STORYBOOK_ENABLED = "1";

    renderNative(<StorybookScreen />);

    expect(screen.getByText("Developer route unavailable")).toBeTruthy();
    expect(screen.queryByTestId("ui-preview-surface")).toBeNull();
    expect(screen.queryByTestId("storybook-root")).toBeNull();
  });
});
