import { createHost as mockCreateHost } from "../../test/mock-components";
import { renderNative, screen } from "../../test/render-native";
import { ProfileCard } from "./ProfileCard";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Image: mockCreateHost("Image"),
  Pressable: mockCreateHost("Pressable"),
  View: mockCreateHost("View"),
}));
jest.mock("@repo/ui/components/avatar", () => ({
  __esModule: true,
  Avatar: mockCreateHost("Avatar"),
  AvatarFallback: mockCreateHost("AvatarFallback"),
  AvatarImage: mockCreateHost("AvatarImage"),
}));
jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: mockCreateHost("Card"),
  CardContent: mockCreateHost("CardContent"),
}));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: mockCreateHost("Text") }));
jest.mock("@/lib/server-config", () => ({
  __esModule: true,
  getReachableSupabaseStorageUrl: (url: string) => url,
}));

describe("ProfileCard", () => {
  it("uses the full name as the primary identity while retaining the username", () => {
    renderNative(<ProfileCard profile={{ full_name: "Ada Athlete", username: "ada-rides" }} />);

    expect(screen.getByText("Ada Athlete")).toBeTruthy();
    expect(screen.getByText("@ada-rides")).toBeTruthy();
    expect(screen.getByText("A")).toBeTruthy();
  });

  it("does not present absent or redacted social counts as zero", () => {
    renderNative(
      <ProfileCard
        profile={{ followers_count: null, following_count: undefined, username: "private-rider" }}
      />,
    );

    expect(screen.queryByText("Followers")).toBeNull();
    expect(screen.queryByText("Following")).toBeNull();
    expect(screen.queryByText("0")).toBeNull();
  });

  it("continues to render each available count, including a real zero", () => {
    renderNative(
      <ProfileCard
        profile={{ followers_count: 0, following_count: null, username: "new-rider" }}
      />,
    );

    expect(screen.getByText("Followers")).toBeTruthy();
    expect(screen.getByText("0")).toBeTruthy();
    expect(screen.queryByText("Following")).toBeNull();
  });

  it("exposes selected and disabled selection semantics", () => {
    const onPress = jest.fn();
    const rendered = renderNative(
      <ProfileCard
        disabled
        onPress={onPress}
        profile={{ full_name: "Ada Athlete" }}
        selected
        testID="selectable-profile"
      />,
    );

    const identity = screen.getByTestId("selectable-profile-identity");
    expect(identity.props.accessibilityState).toEqual({ disabled: true, selected: true });
    expect(identity.props.accessibilityLabel).toBe("Deselect profile Ada Athlete");
    expect(identity.props.onPress).toBeUndefined();
    expect(onPress).not.toHaveBeenCalled();
    expect(rendered.getByTestId("selectable-profile").props.className).toContain("border-primary");
  });
});
