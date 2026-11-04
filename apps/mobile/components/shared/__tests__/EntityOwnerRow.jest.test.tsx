import { createHost } from "../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../test/render-native";
import { EntityOwnerRow } from "../EntityOwnerRow";

const navigateMock = jest.fn();

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  useAppNavigate: () => navigateMock,
}));

jest.mock("@/lib/stores/auth-store", () => ({
  useAuthStore: (selector: (state: { user: null }) => unknown) => selector({ user: null }),
}));

jest.mock("@/lib/server-config", () => ({
  getReachableSupabaseStorageUrl: (value: string) =>
    value.startsWith("http") ? value : `https://storage.example.test/profile-avatars/${value}`,
}));

jest.mock("@repo/ui/components/avatar", () => ({
  Avatar: createHost("Avatar"),
  AvatarFallback: createHost("AvatarFallback"),
  AvatarImage: createHost("AvatarImage"),
}));

describe("EntityOwnerRow", () => {
  beforeEach(() => {
    navigateMock.mockReset();
  });

  it("names a pressable owner as a 44dp profile button and preserves the override callback", async () => {
    const onPress = jest.fn();
    const { getByLabelText } = await renderNative(
      <EntityOwnerRow
        displayNameOverride="Coach Kim"
        onPress={onPress}
        owner={{ id: "owner-1", username: "Ignored name" }}
      />,
    );

    const ownerButton = getByLabelText("Open profile for Coach Kim");
    expect(ownerButton.props.accessibilityRole).toBe("button");
    expect(ownerButton.props.className).toContain("min-h-11");
    expect(ownerButton.props.className).toContain("min-w-11");

    await fireEvent.press(ownerButton);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("keeps a static owner row noninteractive", async () => {
    const { getByTestId, queryByLabelText } = await renderNative(
      <EntityOwnerRow owner={{ username: "Static Coach" }} testID="static-owner" />,
    );

    const ownerRow = getByTestId("static-owner");
    expect(ownerRow.props.accessibilityRole).toBeUndefined();
    expect(ownerRow.props.onPress).toBeUndefined();
    expect(queryByLabelText("Open profile for Static Coach")).toBeNull();
  });

  it("uses a product attribution fallback rather than an unknown-user label", async () => {
    const { getByText, queryByText } = await renderNative(<EntityOwnerRow />);

    expect(getByText("GradientPeak athlete")).toBeTruthy();
    expect(queryByText("Unknown User")).toBeNull();
  });

  it("retains canonical profile navigation when no override callback is provided", async () => {
    const { getByLabelText } = await renderNative(
      <EntityOwnerRow owner={{ id: "owner-2", username: "Coach Lee" }} />,
    );

    await fireEvent.press(getByLabelText("Open profile for Coach Lee"));

    expect(navigateMock).toHaveBeenCalledWith({
      pathname: "/user/[userId]",
      params: { userId: "owner-2" },
    });
  });

  it("renders a legacy owner avatar path as a reachable image URL for canonical cards", async () => {
    await renderNative(
      <EntityOwnerRow
        owner={{ id: "owner-2", username: "Coach Lee", avatar_url: "owner-2/avatar.jpg" }}
      />,
    );

    const image = screen.container.queryAll((node) => node.type === "AvatarImage")[0];
    expect(image?.props.source).toEqual({
      uri: "https://storage.example.test/profile-avatars/owner-2/avatar.jpg",
    });
  });
});
