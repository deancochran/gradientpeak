import React from "react";
import { renderNative, screen } from "../../../../test/render-native";

jest.mock("@/components/coaching/CoachingPublicationPermissions", () => ({
  __esModule: true,
  CoachingPublicationPermissions: () =>
    React.createElement("CoachingPublicationPermissions", {
      testID: "coaching-publication-permissions",
    }),
}));

const CoachingPermissionsScreen = require("../coaching-permissions").default;

describe("Coaching permissions route", () => {
  it("renders the athlete-owned coaching publication permission screen", async () => {
    await renderNative(<CoachingPermissionsScreen />);

    expect(screen.getByTestId("coaching-publication-permissions")).toBeTruthy();
  });
});
