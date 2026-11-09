import { View } from "react-native";
import { renderNative, screen } from "../../../../test/render-native";

jest.mock("expo-router", () => ({
  __esModule: true,
  Redirect: ({ href }: { href: string }) => (
    <View accessibilityLabel={href} testID="settings-redirect" />
  ),
}));

const Settings = require("../settings").default;

it("redirects settings to the maintained profile editing screen", async () => {
  await renderNative(<Settings />);

  expect(screen.getByTestId("settings-redirect").props.accessibilityLabel).toBe("/profile-edit");
});
