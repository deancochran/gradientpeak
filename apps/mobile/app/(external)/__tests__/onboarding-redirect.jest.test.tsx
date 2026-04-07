import React from "react";
import { renderNative, screen } from "../../../test/render-native";

jest.mock("expo-router", () => ({
  __esModule: true,
  Redirect: ({ href }: { href: string }) =>
    React.createElement("Text", { testID: "redirect" }, href),
}));

const ExternalOnboardingScreen = require("../onboarding").default;

describe("external onboarding route", () => {
  it("redirects into the canonical guarded app flow", () => {
    renderNative(<ExternalOnboardingScreen />);

    expect(screen.getByTestId("redirect").props.children).toBe("/");
  });
});
