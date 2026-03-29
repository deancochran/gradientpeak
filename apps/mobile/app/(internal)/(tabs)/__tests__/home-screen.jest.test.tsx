import React from "react";
import { createHost } from "../../../../test/mock-components";
import { renderNative, screen } from "../../../../test/render-native";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("../../../../../../packages/ui/src/test/react-native"),
  View: createHost("View"),
}));

jest.mock("@/components/ErrorBoundary", () => ({
  __esModule: true,
  ErrorBoundary: ({ children }: any) => children,
  ScreenErrorFallback: createHost("ScreenErrorFallback"),
}));

jest.mock("@/components/feed", () => ({
  __esModule: true,
  FeedList: () => React.createElement("Text", null, "Feed list rendered"),
}));

jest.mock("@/components/shared", () => ({
  __esModule: true,
  AppHeader: ({ title }: any) => React.createElement("Text", null, `Header:${title}`),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

const HomeScreen = require("../index").default;

describe("home screen", () => {
  it("renders the feed tab shell", () => {
    renderNative(<HomeScreen />);

    expect(screen.getByText("Header:Feed")).toBeTruthy();
    expect(screen.getByText("Feed list rendered")).toBeTruthy();
  });
});
