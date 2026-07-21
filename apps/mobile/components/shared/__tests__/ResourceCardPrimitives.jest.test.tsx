import { Text } from "@repo/ui/components/text";
import { Pressable } from "react-native";
import { fireEvent, renderNative } from "../../../test/render-native";
import {
  ResourceCardActionButton,
  ResourceCardShell,
  ResourceLikeButton,
} from "../ResourceCardPrimitives";

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  useAppNavigate: () => jest.fn(),
}));

describe("ResourceCardPrimitives", () => {
  it("keeps named navigation and action controls as independent siblings", () => {
    const onActionPress = jest.fn();
    const onNavigationPress = jest.fn();
    const { getByLabelText, getByTestId } = renderNative(
      <ResourceCardShell
        accessibilityLabel="Open route Ridge loop"
        actionRegion={
          <Pressable
            accessibilityLabel="Route options"
            accessibilityRole="button"
            onPress={onActionPress}
          >
            <Text>Options</Text>
          </Pressable>
        }
        onPress={onNavigationPress}
      >
        <Text>Ridge loop</Text>
      </ResourceCardShell>,
    );

    const navigation = getByLabelText("Open route Ridge loop");
    const action = getByLabelText("Route options");
    const actionRegion = getByTestId("resource-card-action-region");

    expect(navigation.props.accessibilityRole).toBe("button");
    expect(action.props.accessibilityRole).toBe("button");
    expect(
      navigation.findAll((node) => node.props.accessibilityLabel === "Route options"),
    ).toHaveLength(0);
    expect(
      actionRegion.findAll((node) => node.props.accessibilityLabel === "Open route Ridge loop"),
    ).toHaveLength(0);

    fireEvent.press(navigation);
    expect(onNavigationPress).toHaveBeenCalledTimes(1);
    expect(onActionPress).not.toHaveBeenCalled();

    fireEvent.press(action);
    expect(onActionPress).toHaveBeenCalledTimes(1);
    expect(onNavigationPress).toHaveBeenCalledTimes(1);
  });

  it("preserves static noninteractive card content", () => {
    const { getByText, queryByRole } = renderNative(
      <ResourceCardShell>
        <Text>Static summary</Text>
      </ResourceCardShell>,
    );

    expect(getByText("Static summary")).toBeTruthy();
    expect(queryByRole("button")).toBeNull();
  });

  it("preserves disabled and selected semantics without invoking navigation", () => {
    const onPress = jest.fn();
    const { getByLabelText } = renderNative(
      <ResourceCardShell
        accessibilityLabel="Open selected group"
        accessibilityState={{ selected: true }}
        disabled
        onPress={onPress}
      >
        <Text>Selected group</Text>
      </ResourceCardShell>,
    );

    const navigation = getByLabelText("Open selected group");
    expect(navigation.props.accessibilityState).toEqual({ disabled: true, selected: true });
    expect(navigation.props.onPress).toBeUndefined();
    expect(onPress).not.toHaveBeenCalled();
  });

  it("exposes like state and an explicit 44dp minimum target", () => {
    const { getByLabelText } = renderNative(
      <ResourceLikeButton isLiked likeCount={3} onPress={jest.fn()} />,
    );
    const button = getByLabelText("Unlike, 3 likes");

    expect(button.props.accessibilityRole).toBe("button");
    expect(button.props.accessibilityState).toEqual({ disabled: false, selected: true });
    expect(button.props.className).toContain("min-h-11");
    expect(button.props.className).toContain("min-w-11");
    expect(button.props.hitSlop).toBe(8);
  });

  it("provides canonical accessory semantics and geometry", () => {
    const onPress = jest.fn();
    const { getByLabelText } = renderNative(
      <ResourceCardActionButton accessibilityLabel="Route options" onPress={onPress}>
        <Text>Options</Text>
      </ResourceCardActionButton>,
    );

    const button = getByLabelText("Route options");
    expect(button.props.accessibilityRole).toBe("button");
    expect(button.props.accessibilityState).toEqual({ disabled: false });
    expect(button.props.className).toContain("min-h-11");
    expect(button.props.className).toContain("min-w-11");

    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
