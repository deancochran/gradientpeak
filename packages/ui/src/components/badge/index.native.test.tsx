import { renderNative } from "../../test/render-native";
import { badgeFixtures } from "./fixtures";
import { Badge } from "./index.native";

describe("Badge native", () => {
  it("maps normalized test props and renders its content", () => {
    const { getByTestId } = renderNative(
      <Badge testId={badgeFixtures.featured.testId}>{badgeFixtures.featured.children}</Badge>,
    );

    const badge = getByTestId(badgeFixtures.featured.testId);

    expect(badge.props.testID).toBe(badgeFixtures.featured.testId);
    expect(badge.props.children).toBe(badgeFixtures.featured.children);
  });
});
