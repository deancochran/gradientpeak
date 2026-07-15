import React from "react";
import { createHost } from "../../../../test/mock-components";
import { renderNative, screen } from "../../../../test/render-native";

const invalidateMock = jest.fn();
const mutateAsyncMock = jest.fn();

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: { Screen: createHost("StackScreen") },
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

jest.mock("@/components/profile/CssTestForm", () => ({
  __esModule: true,
  CssTestForm: ({ onSubmit }: { onSubmit: (values: unknown) => Promise<unknown> }) =>
    React.createElement("CssTestForm", { onSubmit, testID: "css-test-form" }),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    useUtils: () => ({ profileMetrics: { invalidate: invalidateMock } }),
    profileMetrics: {
      recordCssTest: { useMutation: () => ({ mutateAsync: mutateAsyncMock }) },
    },
  },
}));

const ProfileCssTestScreen = require("../profile-css-test").default;

describe("ProfileCssTestScreen", () => {
  beforeEach(() => {
    invalidateMock.mockReset().mockResolvedValue(undefined);
    mutateAsyncMock.mockReset().mockResolvedValue({ css_seconds_per_100m: 96 });
  });

  it("calls the dedicated atomic CSS test mutation", async () => {
    renderNative(<ProfileCssTestScreen />);

    const result = await screen.getByTestId("css-test-form").props.onSubmit({
      operationId: "22222222-2222-4222-8222-222222222222",
      recordedAt: new Date("2026-07-14T09:00:00.000Z"),
      time400Seconds: 360,
      time200Seconds: 168,
    });

    expect(mutateAsyncMock).toHaveBeenCalledWith({
      operation_id: "22222222-2222-4222-8222-222222222222",
      recorded_at: new Date("2026-07-14T09:00:00.000Z"),
      time_200_seconds: 168,
      time_400_seconds: 360,
    });
    expect(invalidateMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ css_seconds_per_100m: 96 });
  });
});
