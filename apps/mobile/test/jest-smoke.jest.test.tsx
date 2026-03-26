import { Text } from "@repo/ui/components/text";
import React from "react";

import { renderNative, screen } from "../../../packages/ui/src/test/render-native";

describe("mobile jest setup", () => {
  it("renders a shared native UI component", () => {
    renderNative(<Text testId="jest-smoke-text">Jest ready</Text>);

    expect(screen.getByText("Jest ready")).toBeTruthy();
    expect(screen.getByTestId("jest-smoke-text")).toBeTruthy();
  });
});
