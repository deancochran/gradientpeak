import { Text } from "@repo/ui/components/text";
import { renderNative, screen } from "@repo/ui/test/render-native";
import React from "react";

describe("mobile jest setup", () => {
  it("renders a shared native UI component", () => {
    renderNative(<Text testId="jest-smoke-text">Jest ready</Text>);

    expect(screen.getByText("Jest ready")).toBeTruthy();
    expect(screen.getByTestId("jest-smoke-text")).toBeTruthy();
  });
});
