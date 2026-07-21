import { fireEvent, renderNative } from "../../../test/render-native";
import { EntityOwnerRow } from "../EntityOwnerRow";

const navigateMock = jest.fn();

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  useAppNavigate: () => navigateMock,
}));

jest.mock("@/lib/stores/auth-store", () => ({
  useAuthStore: (selector: (state: { user: null }) => unknown) => selector({ user: null }),
}));

describe("EntityOwnerRow", () => {
  beforeEach(() => {
    navigateMock.mockReset();
  });

  it("names a pressable owner as a 44dp profile button and preserves the override callback", () => {
    const onPress = jest.fn();
    const { getByLabelText } = renderNative(
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

    fireEvent.press(ownerButton);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("keeps a static owner row noninteractive", () => {
    const { getByTestId, queryByLabelText } = renderNative(
      <EntityOwnerRow owner={{ username: "Static Coach" }} testID="static-owner" />,
    );

    const ownerRow = getByTestId("static-owner");
    expect(ownerRow.props.accessibilityRole).toBeUndefined();
    expect(ownerRow.props.onPress).toBeUndefined();
    expect(queryByLabelText("Open profile for Static Coach")).toBeNull();
  });

  it("retains canonical profile navigation when no override callback is provided", () => {
    const { getByLabelText } = renderNative(
      <EntityOwnerRow owner={{ id: "owner-2", username: "Coach Lee" }} />,
    );

    fireEvent.press(getByLabelText("Open profile for Coach Lee"));

    expect(navigateMock).toHaveBeenCalledWith({
      pathname: "/user/[userId]",
      params: { userId: "owner-2" },
    });
  });
});
