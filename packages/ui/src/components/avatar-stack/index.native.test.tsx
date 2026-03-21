import { renderNative } from "../../test/render-native";
import { avatarStackFixtures } from "./fixtures";
import { AvatarStack } from "./index.native";

describe("AvatarStack native", () => {
  it("renders initials and hidden count from fixtures", () => {
    const { getByText } = renderNative(<AvatarStack {...avatarStackFixtures.team} />);

    expect(getByText("AM")).toBeTruthy();
    expect(getByText("JL")).toBeTruthy();
    expect(getByText("SP")).toBeTruthy();
    expect(getByText("+1")).toBeTruthy();
  });
});
