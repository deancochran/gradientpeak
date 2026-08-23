import React from "react";
import { Text } from "react-native";
import { createHost as mockCreateHost } from "../../../test/mock-components";
import { renderNative, screen } from "../../../test/render-native";
import { TrainingPreferencesBottomSheet } from "./TrainingPreferencesBottomSheet";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  View: mockCreateHost("View"),
}));
jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: mockCreateHost("Button"),
}));
jest.mock("@repo/ui/components/loading", () => ({
  __esModule: true,
  LoadingButton: mockCreateHost("LoadingButton"),
}));
jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: mockCreateHost("Text"),
}));
jest.mock("@/components/shared/AppBottomSheet", () => ({
  __esModule: true,
  APP_BOTTOM_SHEET_PRESENTATIONS: {
    inspector: { initialSnapIndex: 0, snapPoints: ["82%", "96%"] },
  },
  AppBottomSheet: ({
    children,
    footer,
    ...props
  }: React.PropsWithChildren<{ footer: React.ReactNode }>) =>
    React.createElement("AppBottomSheet", props, children, footer),
}));

describe("TrainingPreferencesBottomSheet", () => {
  it("uses the inspector preset and labels draft restoration clearly", async () => {
    await renderNative(
      <TrainingPreferencesBottomSheet
        onClose={jest.fn()}
        onReset={jest.fn()}
        onSave={jest.fn()}
        visible
      >
        <Text>Preferences</Text>
      </TrainingPreferencesBottomSheet>,
    );

    expect(screen.getByTestId("training-preferences-bottom-sheet").props).toMatchObject({
      initialSnapIndex: 0,
      snapPoints: ["82%", "96%"],
    });
    expect(screen.getByText("Revert changes")).toBeTruthy();
  });
});
