import { Text } from "@repo/ui/components/text";
import { fireEvent, render } from "@testing-library/react-native";
import { KeyboardAvoidingView, Modal, Platform, ScrollView, View } from "react-native";
import { AppConfirmModal, AppFormModal } from "../AppFormModal";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 34, left: 0, right: 0, top: 0 }),
}));

describe("AppFormModal", () => {
  it("keeps footer actions above the bottom safe area and enables keyboard avoidance", () => {
    const { UNSAFE_getAllByType, UNSAFE_getByType, getByRole } = render(
      <AppFormModal
        footerContent={<Text>Save actions</Text>}
        onClose={jest.fn()}
        title="Edit details"
      >
        <Text>Form content</Text>
      </AppFormModal>,
    );

    expect(UNSAFE_getByType(KeyboardAvoidingView).props.behavior).toBe(
      Platform.OS === "ios" ? "padding" : "height",
    );
    expect(UNSAFE_getByType(Modal).props.accessibilityViewIsModal).toBe(true);
    expect(getByRole("header")).toHaveTextContent("Edit details");

    const footer = UNSAFE_getAllByType(View).find((view) => view.props.style?.paddingBottom === 50);
    expect(footer).toBeTruthy();
  });

  it("adds bottom safe-area clearance to content when no footer is rendered", () => {
    const callerStyle = { paddingTop: 8 };
    const { UNSAFE_getByType } = render(
      <AppFormModal
        onClose={jest.fn()}
        scrollProps={{ contentContainerStyle: callerStyle }}
        title="Read details"
      >
        <View />
      </AppFormModal>,
    );

    expect(UNSAFE_getByType(ScrollView).props.contentContainerStyle).toEqual([
      { paddingBottom: 50 },
      callerStyle,
    ]);
  });

  it("provides a labeled, stable 44-point close action", () => {
    const onClose = jest.fn();
    const { getByTestId } = render(
      <AppFormModal onClose={onClose} testID="edit-details" title="Edit details">
        <View />
      </AppFormModal>,
    );

    const closeButton = getByTestId("edit-details-close");
    expect(closeButton.props.accessibilityLabel).toBe("Close Edit details");
    expect(closeButton.props.accessibilityRole).toBe("button");
    expect(closeButton.props.accessibilityState).toEqual({ disabled: false });
    expect(closeButton.props.className).toContain("min-h-12 min-w-12");
    fireEvent.press(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("marks a loading confirmation action busy and disables repeat presses", () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <AppConfirmModal
        description="This takes a moment."
        onClose={jest.fn()}
        primaryAction={{ label: "Save", loading: true, onPress, testID: "confirm-save" }}
        title="Confirm save"
      />,
    );

    const saveButton = getByTestId("confirm-save");
    expect(saveButton.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    expect(saveButton.props.disabled).toBe(true);
  });
});
