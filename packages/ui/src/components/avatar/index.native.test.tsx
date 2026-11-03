import { Text } from "react-native";
import { renderNative } from "../../test/render-native";
import { avatarFixtures } from "./fixtures";
import { Avatar, AvatarFallback } from "./index.native";

describe("Avatar native", () => {
  it("maps normalized test props onto the avatar root", async () => {
    const { getByTestId } = await renderNative(
      <Avatar
        accessibilityLabel={avatarFixtures.profile.alt}
        alt={avatarFixtures.profile.alt}
        testId={avatarFixtures.profile.testId}
      >
        <AvatarFallback testID="profile-avatar-fallback">
          <Text>{avatarFixtures.profile.fallback}</Text>
        </AvatarFallback>
      </Avatar>,
    );

    expect(getByTestId(avatarFixtures.profile.testId).props.testID).toBe(
      avatarFixtures.profile.testId,
    );
    expect(getByTestId("profile-avatar-fallback")).toBeTruthy();
  });
});
