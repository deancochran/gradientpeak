import { Text } from "react-native";
import { renderNative } from "../../test/render-native";
import { badgeFixtures } from "./fixtures";
import { Badge } from "./index.native";

describe("Badge native", () => {
  it("maps normalized test props and renders its content", async () => {
    const { getByTestId, getByText } = await renderNative(
      <Badge testId={badgeFixtures.featured.testId}>
        <Text>{badgeFixtures.featured.children}</Text>
      </Badge>,
    );

    const badge = getByTestId(badgeFixtures.featured.testId);

    expect(badge.props.testID).toBe(badgeFixtures.featured.testId);
    expect(getByText(badgeFixtures.featured.children)).toBeTruthy();
  });

  it("uses the contrast-safe destructive surface token", async () => {
    const { getByTestId } = await renderNative(
      <Badge testId="destructive-badge" variant="destructive">
        <Text>Failed</Text>
      </Badge>,
    );

    expect(getByTestId("destructive-badge").props.className).toContain("bg-destructive-surface");
  });
});
