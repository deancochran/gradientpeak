import { Text } from "@repo/ui/components/text";
import { fireEvent, render } from "@testing-library/react-native";
import { Platform, View } from "react-native";
import { AppConfirmModal, AppFormModal } from "../AppFormModal";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 34, left: 0, right: 0, top: 47 }),
}));

describe("AppFormModal", () => {
  it("opts dedicated editors into full-screen presentation with top safe-area clearance", async () => {
    const { container } = await render(
      <AppFormModal
        presentationStyle="fullScreen"
        actionPlacement="header"
        onClose={jest.fn()}
        title="Edit Step"
      >
        <Text>Step fields</Text>
      </AppFormModal>,
    );
    expect(container.queryAll((node) => node.type === "Modal")[0]?.props.presentationStyle).toBe(
      "fullScreen",
    );
    expect(
      container.queryAll((node) => node.type === "KeyboardAvoidingView")[0]?.props.style,
    ).toEqual({ paddingTop: 47 });
  });
  it("keeps footer actions above the bottom safe area and enables keyboard avoidance", async () => {
    const { container, getByRole } = await render(
      <AppFormModal
        footerContent={<Text>Save actions</Text>}
        onClose={jest.fn()}
        title="Edit details"
      >
        <Text>Form content</Text>
      </AppFormModal>,
    );

    expect(
      container.queryAll((node) => node.type === "KeyboardAvoidingView")[0]?.props.behavior,
    ).toBe(Platform.OS === "ios" ? "padding" : "height");
    expect(
      container.queryAll((node) => node.type === "Modal")[0]?.props.accessibilityViewIsModal,
    ).toBe(true);
    expect(getByRole("header")).toHaveTextContent("Edit details");
    expect(container.queryAll((node) => node.type === "Modal")[0]?.props.presentationStyle).toBe(
      "pageSheet",
    );

    const footer = container
      .queryAll((node) => node.type === "View")
      .find((view) => view.props.style?.paddingBottom === 50);
    expect(footer).toBeTruthy();
  });

  it("adds bottom safe-area clearance to content when no footer is rendered", async () => {
    const callerStyle = { paddingTop: 8 };
    const { container } = await render(
      <AppFormModal
        onClose={jest.fn()}
        scrollProps={{ contentContainerStyle: callerStyle }}
        title="Read details"
      >
        <View />
      </AppFormModal>,
    );

    expect(
      container.queryAll((node) => node.type === "ScrollView")[0]?.props.contentContainerStyle,
    ).toEqual([
      { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 50, rowGap: 16 },
      callerStyle,
    ]);
  });

  it("provides a labeled, stable 44-point close action", async () => {
    const onClose = jest.fn();
    const { getByTestId } = await render(
      <AppFormModal onClose={onClose} testID="edit-details" title="Edit details">
        <View />
      </AppFormModal>,
    );

    const closeButton = getByTestId("edit-details-close");
    expect(closeButton.props.accessibilityLabel).toBe("Close Edit details");
    expect(closeButton.props.accessibilityRole).toBe("button");
    expect(closeButton.props.accessibilityState).toEqual({ disabled: false });
    expect(closeButton.props.className).toContain("min-h-12 min-w-12");
    await fireEvent.press(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("can scope one primary action to a centered header without a footer", async () => {
    const { container, getByText } = await render(
      <AppFormModal
        actionPlacement="header"
        onClose={jest.fn()}
        primaryAction={<Text>Done</Text>}
        title="Edit interval"
      >
        <View />
      </AppFormModal>,
    );

    expect(getByText("Done")).toBeTruthy();
    expect(
      container.queryAll((node) => node.type === "View" && node.props.style?.paddingBottom === 50),
    ).toHaveLength(0);
  });

  it("marks a loading confirmation action busy and disables repeat presses", async () => {
    const onPress = jest.fn();
    const { getByTestId } = await render(
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
