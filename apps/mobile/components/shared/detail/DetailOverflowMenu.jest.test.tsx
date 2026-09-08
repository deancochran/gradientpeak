import { act, fireEvent, renderNative, screen } from "../../../test/render-native";
import { DetailOverflowMenu } from "./DetailOverflowMenu";

describe("DetailOverflowMenu", () => {
  it("opens a real accessible modal from an expanded-aware 44dp trigger", async () => {
    const rendered = await renderNative(
      <DetailOverflowMenu
        actions={[{ label: "Edit", onPress: jest.fn(), testID: "edit-action" }]}
        testID="detail-actions"
      />,
    );

    const trigger = screen.getByLabelText("Open actions menu");
    expect(trigger.props.accessibilityRole).toBe("button");
    expect(trigger.props.accessibilityState).toMatchObject({ expanded: false });
    expect(trigger.props.className).toContain("min-h-11");
    expect(trigger.props.className).toContain("min-w-11");

    await fireEvent.press(trigger);

    const expandedTrigger = rendered.container.queryAll(
      (node) => node.props.testID === "detail-actions",
    )[0];
    expect(expandedTrigger?.props.accessibilityState).toMatchObject({ expanded: true });
    expect(screen.getByTestId("detail-actions-menu").props).toMatchObject({
      accessibilityViewIsModal: true,
      transparent: true,
      visible: true,
    });
    expect(screen.getByTestId("edit-action").props).toMatchObject({
      accessibilityLabel: "Edit",
      accessibilityRole: "button",
      testID: "edit-action",
    });
  });

  it("closes before invoking an enabled action", async () => {
    const onPress = jest.fn(() => {
      expect(screen.queryByTestId("detail-actions-menu")).toBeNull();
    });
    await renderNative(
      <DetailOverflowMenu
        actions={[
          {
            label: "Delete Activity",
            onPress,
            testID: "activity-detail-options-delete",
            variant: "destructive",
          },
        ]}
        testID="activity-detail-options-trigger"
      />,
    );

    await fireEvent.press(screen.getByTestId("activity-detail-options-trigger"));
    await fireEvent.press(screen.getByTestId("activity-detail-options-delete"));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Open actions menu").props.accessibilityState).toMatchObject({
      expanded: false,
    });
  });

  it("keeps the menu open and does not invoke a disabled action", async () => {
    const onPress = jest.fn();
    await renderNative(
      <DetailOverflowMenu
        actions={[{ disabled: true, label: "Saving...", onPress, testID: "save-action" }]}
        testID="detail-actions"
      />,
    );

    await fireEvent.press(screen.getByTestId("detail-actions"));
    const disabledAction = screen.getByTestId("save-action");
    expect(disabledAction.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(disabledAction);

    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByTestId("detail-actions-menu")).toBeTruthy();
  });

  it("supports backdrop, Android back, and an explicit accessible close action", async () => {
    const rendered = await renderNative(
      <DetailOverflowMenu
        actions={[{ label: "Edit", onPress: jest.fn(), testID: "edit-action" }]}
        testID="detail-actions"
      />,
    );

    await fireEvent.press(screen.getByTestId("detail-actions"));
    const backdrop = rendered.container.queryAll(
      (node) => node.props.testID === "detail-actions-backdrop",
    )[0];
    if (!backdrop) {
      throw new Error("Expected the actions-menu backdrop to be visible");
    }
    await fireEvent.press(backdrop);
    expect(screen.queryByTestId("detail-actions-menu")).toBeNull();

    await fireEvent.press(screen.getByTestId("detail-actions"));
    await act(() =>
      rendered.container.queryAll((node) => node.type === "Modal")[0]?.props.onRequestClose(),
    );
    expect(screen.queryByTestId("detail-actions-menu")).toBeNull();

    await fireEvent.press(screen.getByTestId("detail-actions"));
    await fireEvent.press(screen.getByLabelText("Close actions menu"));
    expect(screen.queryByTestId("detail-actions-menu")).toBeNull();
  });
});
