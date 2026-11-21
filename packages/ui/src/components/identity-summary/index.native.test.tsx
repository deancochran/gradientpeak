import { renderNative } from "../../test/render-native";
import { identitySummaryFixtures } from "./fixtures";
import { IdentitySummary } from "./index.native";

describe("IdentitySummary native", () => {
  it("keeps a long title and supporting identity visible", async () => {
    const { getByText } = await renderNative(
      <IdentitySummary {...identitySummaryFixtures.longIdentity} />,
    );

    expect(getByText(identitySummaryFixtures.longIdentity.title)).toBeTruthy();
    expect(getByText(identitySummaryFixtures.longIdentity.supporting)).toBeTruthy();
  });

  it("maps semantic web heading requests to the native header role without faking a level", async () => {
    const { getByText } = await renderNative(
      <IdentitySummary title="Assigned athlete" titleAs="h3" />,
    );

    const title = getByText("Assigned athlete");
    expect(title.props.accessibilityRole).toBe("header");
    expect(title.props.accessibilityLevel).toBeUndefined();
  });
});
