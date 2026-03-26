import * as React from "react";

jest.mock("@rn-primitives/slot", () => {
  return {
    Text: (props: any) => React.createElement("Slot.Text", props, props.children),
  };
});

import { renderNative } from "../../test/render-native";
import { cardFixtures } from "./fixtures";
import { Card, CardContent, CardHeader, CardTitle } from "./index.native";

describe("Card native", () => {
  it("maps normalized test props and renders heading content", () => {
    const { getByLabelText, getByTestId, getByText } = renderNative(
      <Card {...cardFixtures.profile}>
        <CardHeader>
          <CardTitle>{cardFixtures.profile.title}</CardTitle>
        </CardHeader>
        <CardContent />
      </Card>,
    );

    expect(getByLabelText(cardFixtures.profile.accessibilityLabel)).toBeTruthy();
    expect(getByTestId(cardFixtures.profile.testId).props.testID).toBe(cardFixtures.profile.testId);
    expect(getByText(cardFixtures.profile.title)).toBeTruthy();
  });
});
