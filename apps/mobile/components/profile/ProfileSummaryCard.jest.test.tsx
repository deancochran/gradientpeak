import React from "react";
import { createButtonComponent, createHost } from "../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../test/render-native";
import { ProfileSummaryCard } from "./ProfileSummaryCard";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Image: createHost("Image"),
  TouchableOpacity: ({ children, disabled, onPress, ...props }: any) =>
    React.createElement("TouchableOpacity", { disabled, onPress, ...props }, children),
  View: createHost("View"),
}));

jest.mock("@repo/ui/components/avatar", () => ({
  __esModule: true,
  Avatar: createHost("Avatar"),
  AvatarFallback: createHost("AvatarFallback"),
  AvatarImage: createHost("AvatarImage"),
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: createButtonComponent(),
}));

jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

jest.mock("@/lib/server-config", () => ({
  __esModule: true,
  getReachableSupabaseStorageUrl: (url: string) => `reachable:${url}`,
}));

describe("ProfileSummaryCard", () => {
  it("renders safe identity and privacy fallbacks for sparse profiles", () => {
    renderNative(<ProfileSummaryCard emailFallback="fallback@example.com" profile={{}} />);

    expect(screen.getByText("fallback")).toBeTruthy();
    expect(screen.getByText("F")).toBeTruthy();
    expect(screen.getByText("Private profile")).toBeTruthy();
    expect(screen.getAllByText("0")).toHaveLength(2);
  });

  it("uses remote social counts and keeps follower actions tappable when available", () => {
    const onFollowersPress = jest.fn();
    const onFollowingPress = jest.fn();

    renderNative(
      <ProfileSummaryCard
        onFollowersPress={onFollowersPress}
        onFollowingPress={onFollowingPress}
        profile={{ followers_count: 8, following_count: 13, username: "runner" }}
        testID="profile-summary"
      />,
    );

    fireEvent.press(screen.getByTestId("profile-summary-followers"));
    fireEvent.press(screen.getByTestId("profile-summary-following"));

    expect(screen.getByText("8")).toBeTruthy();
    expect(screen.getByText("13")).toBeTruthy();
    expect(onFollowersPress).toHaveBeenCalledTimes(1);
    expect(onFollowingPress).toHaveBeenCalledTimes(1);
  });

  it("ignores invalid birth dates while still rendering available metadata", () => {
    renderNative(
      <ProfileSummaryCard
        profile={{
          bio: "Chasing mountain mornings.",
          dob: "not-a-date",
          gender: "nonbinary",
          language: "en",
          preferred_units: "metric",
          username: "climber",
        }}
        showMetadata
      />,
    );

    expect(screen.getByText("Chasing mountain mornings.")).toBeTruthy();
    expect(screen.getByText("metric")).toBeTruthy();
    expect(screen.getByText("EN")).toBeTruthy();
    expect(screen.queryByText(/years/)).toBeNull();
  });
});
