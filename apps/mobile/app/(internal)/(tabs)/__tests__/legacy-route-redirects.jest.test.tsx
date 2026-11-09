import React from "react";
import { renderNative, screen } from "../../../../test/render-native";

jest.mock("expo-router", () => ({
  Redirect: ({ href }: { href: unknown }) =>
    React.createElement("View", { href, testID: "legacy-route-redirect" }),
}));

const CalendarRedirect = require("../calendar").default;
const ProfileRedirect = require("../profile").default;

describe("legacy tab redirects", () => {
  it("redirects Calendar into the Plan calendar view", async () => {
    await renderNative(<CalendarRedirect />);

    expect(screen.getByTestId("legacy-route-redirect").props.href).toEqual({
      pathname: "/(internal)/(tabs)/plan",
      params: { view: "calendar" },
    });
  });

  it("redirects Profile to Me", async () => {
    await renderNative(<ProfileRedirect />);

    expect(screen.getByTestId("legacy-route-redirect").props.href).toBe("/me");
  });
});
