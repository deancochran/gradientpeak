import * as React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => import("../../test/react-native"));
vi.mock("@rn-primitives/slot", () => {
  return {
    Text: (props: any) =>
      React.createElement("Slot.Text", props, props.children),
  };
});

import { renderNative } from "../../test/render-native";
import { Card, CardContent, CardHeader, CardTitle } from "./index.native";

describe("Card native", () => {
  it("maps normalized test props and renders heading content", () => {
    const { getByLabelText, getByTestId, getByText } = renderNative(
      <Card
        accessibilityLabel="Profile summary"
        role="article"
        testId="profile-card"
      >
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent />
      </Card>,
    );

    expect(getByLabelText("Profile summary")).toBeTruthy();
    expect(getByTestId("profile-card").props.testID).toBe("profile-card");
    expect(getByText("Profile")).toBeTruthy();
  });
});
