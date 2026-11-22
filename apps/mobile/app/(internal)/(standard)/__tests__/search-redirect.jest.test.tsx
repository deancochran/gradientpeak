import React from "react";
import { renderNative, screen } from "../../../../test/render-native";

jest.mock("expo-router", () => ({
  Redirect: ({ href }: { href: unknown }) =>
    React.createElement("View", { href, testID: "search-redirect" }),
}));

const SearchRedirect = require("../search").default;

it("redirects legacy Search to the Discover tab", async () => {
  await renderNative(<SearchRedirect />);
  expect(screen.getByTestId("search-redirect").props.href).toBe("/(internal)/(tabs)/discover");
});
