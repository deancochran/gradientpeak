import { act } from "@testing-library/react-native/pure";
import { AccessibilityInfo, findNodeHandle, Keyboard, View } from "react-native";
import { fireEvent, renderNative } from "../../test/render-native";
import { ExpoChoiceControl as AndroidChoice } from "./expo-choice.android";
import { ExpoChoiceControl as IosChoice } from "./expo-choice.ios";
import { ChoiceField } from "./index.native";

// Exercise the shared field's real Android adapter, not the Node/RNPicker fallback.
jest.mock("./expo-choice", () => jest.requireActual("./expo-choice.android"));

jest.mock("@expo/ui/swift-ui", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const host = (name: string) => (props: { children?: import("react").ReactNode }) =>
    React.createElement(
      name,
      props,
      name.endsWith("Text") ? React.createElement("Text", null, props.children) : props.children,
    );
  return {
    Host: host("SwiftHost"),
    Picker: host("SwiftPicker"),
    Text: host("SwiftText"),
    Button: host("SwiftButton"),
    VStack: host("SwiftVStack"),
  };
});
jest.mock("@expo/ui/swift-ui/modifiers", () => ({
  tag: (value: number) => ({ type: "tag", value }),
  pickerStyle: (value: string) => ({ type: "pickerStyle", value }),
  disabled: (value: boolean) => ({ type: "disabled", value }),
  accessibilityLabel: (value: string) => ({ type: "accessibilityLabel", value }),
  accessibilityHint: (value: string) => ({ type: "accessibilityHint", value }),
  accessibilityAddTraits: (value: string[]) => ({ type: "accessibilityAddTraits", value }),
  frame: (value: object) => ({ type: "frame", value }),
  buttonStyle: (value: string) => ({ type: "buttonStyle", value }),
}));
jest.mock("@expo/ui/jetpack-compose", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const host = (name: string) => (props: { children?: import("react").ReactNode }) =>
    React.createElement(
      name,
      props,
      name.endsWith("Text") ? React.createElement("Text", null, props.children) : props.children,
    );
  return {
    Host: host("ComposeHost"),
    Column: host("ComposeColumn"),
    Row: host("ComposeRow"),
    RadioButton: host("ComposeRadio"),
    RNHostView: host("RNHostView"),
    SingleChoiceSegmentedButtonRow: host("ComposeSegments"),
    SegmentedButton: Object.assign(host("ComposeSegment"), { Label: host("ComposeSegmentLabel") }),
    DropdownMenu: Object.assign(host("ComposeMenu"), {
      Trigger: host("ComposeMenuTrigger"),
      Items: host("ComposeMenuItems"),
    }),
    DropdownMenuItem: Object.assign(host("ComposeMenuItem"), {
      Text: host("ComposeMenuItemText"),
      TrailingIcon: host("ComposeTrailingIcon"),
    }),
    Text: host("ComposeText"),
    useMaterialColors: () => ({ onBackground: "#111111" }),
  };
});
jest.mock("@expo/ui/jetpack-compose/modifiers", () => ({
  fillMaxWidth: () => ({ type: "fillMaxWidth" }),
  defaultMinSize: (value: object) => ({ type: "defaultMinSize", value }),
  padding: (...value: number[]) => ({ type: "padding", value }),
  selectableGroup: () => ({ type: "selectableGroup" }),
  selectable: (selected: boolean, onSelect: () => void, role: string) => ({
    type: "selectable",
    selected,
    onSelect,
    role,
  }),
}));

describe("Expo choice adapter wiring (mock hosts, not device proof)", () => {
  const options = [
    { value: "easy", label: "Easy" },
    { value: "hard", label: "Hard" },
  ];
  it("blocks captured popup selection, dismissal and opening after the shared owner becomes inactive", async () => {
    let current = true;
    const change = jest.fn();
    const frames: FrameRequestCallback[] = [];
    const raf = jest.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    try {
      const view = await renderNative(
        <ChoiceField
          nativePresentation="menu"
          label="Effort"
          testId="guarded"
          value="easy"
          options={options}
          isCurrent={() => current}
          onChange={change}
        />,
      );
      const trigger = view.getByTestId("guarded-picker");
      expect(trigger.props.accessibilityLabel).toBe("Effort");
      const open = trigger.props.onPress;
      await fireEvent.press(trigger);
      const menu = view.container.queryAll((node) => node.type === "ComposeMenu")[0];
      const item = view.container.queryAll((node) => node.type === "ComposeMenuItem")[1];
      if (!menu || !item) throw new Error("Expected the actual Compose popup boundary.");
      expect(menu.props.expanded).toBe(true);
      expect(view.container.queryAll((node) => node.type === "ComposeTrailingIcon")).toHaveLength(
        1,
      );
      expect(view.container.queryAll((node) => node.type === "Modal")).toHaveLength(0);
      const select = item.props.onClick;
      const dismiss = menu.props.onDismissRequest;
      const keyboardCalls = jest.mocked(Keyboard.dismiss).mock.calls.length;
      // No rerender: the guard must be consulted at callback time.
      current = false;
      await act(async () => {
        select();
        dismiss();
        open();
        for (const frame of frames) frame(0);
      });
      expect(change).not.toHaveBeenCalled();
      expect(findNodeHandle).not.toHaveBeenCalled();
      expect(AccessibilityInfo.setAccessibilityFocus).not.toHaveBeenCalled();
      expect(frames).toHaveLength(0);
      expect(Keyboard.dismiss).toHaveBeenCalledTimes(keyboardCalls);
    } finally {
      raf.mockRestore();
    }
  });
  it.each([
    "owner",
    "disabled",
    "unmount",
    "active",
  ] as const)("checks queued focus restoration against the shared field's %s lifecycle", async (exit) => {
    let current = true;
    const frames: FrameRequestCallback[] = [];
    const raf = jest.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const change = jest.fn();
    const props = {
      nativePresentation: "menu" as const,
      label: "Effort",
      testId: "guarded",
      value: "easy",
      options,
      isCurrent: () => current,
      onChange: change,
    };
    try {
      const view = await renderNative(<ChoiceField {...props} />);
      await fireEvent.press(view.getByTestId("guarded-picker"));
      const menu = view.container.queryAll((node) => node.type === "ComposeMenu")[0];
      if (!menu) throw new Error("Missing Compose popup.");
      await fireEvent(menu, "dismissRequest");
      expect(frames).toHaveLength(1);
      if (exit === "owner") current = false;
      else if (exit === "disabled") await view.rerender(<ChoiceField {...props} disabled />);
      else if (exit === "unmount") await view.unmount();
      else jest.mocked(findNodeHandle).mockReturnValueOnce(42);
      await act(async () => {
        for (const frame of frames) frame(0);
      });
      expect(change).not.toHaveBeenCalled();
      if (exit === "active") {
        expect(findNodeHandle).toHaveBeenCalledTimes(1);
        expect(AccessibilityInfo.setAccessibilityFocus).toHaveBeenCalledWith(42);
      } else {
        expect(findNodeHandle).not.toHaveBeenCalled();
        expect(AccessibilityInfo.setAccessibilityFocus).not.toHaveBeenCalled();
      }
    } finally {
      raf.mockRestore();
    }
  });
  it("lets an old Android popup finish closing without closing the newer popup", async () => {
    const view = await renderNative(
      <View>
        <AndroidChoice
          mode="menu"
          label="First"
          testId="first"
          value="easy"
          options={options}
          onChange={jest.fn()}
        />
        <AndroidChoice
          mode="menu"
          label="Second"
          testId="second"
          value="easy"
          options={options}
          onChange={jest.fn()}
        />
      </View>,
    );
    await fireEvent.press(view.getByTestId("first"));
    const first = view.container.queryAll((node) => node.type === "ComposeMenu")[0];
    if (!first) throw new Error("Missing first native popup.");
    await fireEvent.press(view.getByTestId("second"));
    await fireEvent(first, "dismissRequest");
    const menus = view.container.queryAll((node) => node.type === "ComposeMenu");
    expect(menus[0]?.props.expanded).toBe(false);
    expect(menus[1]?.props.expanded).toBe(true);
  });
  it("uses SwiftUI's actual label/modifier contract and an unselected sentinel", async () => {
    const change = jest.fn();
    const view = await renderNative(
      <IosChoice
        mode="menu"
        label="Effort"
        value="unsupported"
        options={options}
        onChange={change}
      />,
    );
    const picker = view.container.queryAll((node) => node.type === "SwiftPicker")[0];
    expect(picker?.props.label).toBe("Effort");
    expect(picker?.props.selection).toBe(-1);
    expect(picker?.props).not.toHaveProperty("accessibilityLabel");
    expect(picker?.props).not.toHaveProperty("ref");
    expect(view.container.queryAll((node) => node.type === "SwiftHost")[0]?.props).toMatchObject({
      style: { width: "100%", minHeight: 48 },
      matchContents: { vertical: true },
      ignoreSafeArea: "all",
    });
    picker?.props.onSelectionChange(-1);
    picker?.props.onSelectionChange(999);
    expect(change).not.toHaveBeenCalled();
    picker?.props.onSelectionChange(1);
    expect(change).toHaveBeenCalledWith("hard");
  });
  it("uses one measured Compose host with labeled native radio rows and no implicit selection", async () => {
    const view = await renderNative(
      <AndroidChoice
        mode="list"
        label="Effort"
        value={null}
        options={options}
        onChange={jest.fn()}
        disabled
      />,
    );
    const hosts = view.container.queryAll((node) => node.type === "ComposeHost");
    expect(hosts).toHaveLength(1);
    expect(hosts[0]?.props).toMatchObject({
      matchContents: { vertical: true },
      ignoreSafeAreaKeyboardInsets: true,
    });
    expect(view.getByText("Easy")).toBeTruthy();
    expect(view.getByText("Hard")).toBeTruthy();
    for (const radio of view.container.queryAll((node) => node.type === "ComposeRadio"))
      expect(radio.props).toMatchObject({ selected: false, enabled: false });
  });
  it("uses two real SwiftUI segments for a selected pair and visible buttons for an unset pair or panel", async () => {
    const props = { label: "Effort", value: "easy", options, onChange: jest.fn() };
    const view = await renderNative(<IosChoice {...props} mode="segmented" />);
    const picker = view.container.queryAll((node) => node.type === "SwiftPicker")[0];
    expect(picker?.props.modifiers).toContainEqual({ type: "pickerStyle", value: "segmented" });
    expect(view.container.queryAll((node) => node.type === "SwiftText")).toHaveLength(2);
    await view.rerender(<IosChoice {...props} value={undefined} mode="segmented" />);
    expect(view.container.queryAll((node) => node.type === "SwiftPicker")).toHaveLength(0);
    expect(
      view.container
        .queryAll((node) => node.type === "SwiftButton")
        .map((node) => node.props.label),
    ).toEqual(["Easy", "Hard"]);
    expect(props.onChange).not.toHaveBeenCalled();
    await view.rerender(<IosChoice {...props} mode="list" />);
    expect(view.container.queryAll((node) => node.type === "SwiftPicker")).toHaveLength(0);
    expect(view.container.queryAll((node) => node.type === "SwiftButton")).toHaveLength(2);
  });
  it("renders native Compose segments with labels and no nested menu", async () => {
    const change = jest.fn();
    const view = await renderNative(
      <AndroidChoice
        mode="segmented"
        label="Effort"
        value={null}
        options={options}
        onChange={change}
      />,
    );
    expect(view.container.queryAll((node) => node.type === "ComposeSegments")).toHaveLength(1);
    const segments = view.container.queryAll((node) => node.type === "ComposeSegment");
    expect(segments).toHaveLength(2);
    expect(segments.every((node) => node.props.selected === false)).toBe(true);
    expect(view.container.queryAll((node) => node.type === "ComposeMenu")).toHaveLength(0);
    segments[1]?.props.onClick();
    expect(change).toHaveBeenCalledWith("hard");
  });
  it("opens the Android native popup directly after keyboard dismissal and rejects a closed selection", async () => {
    const change = jest.fn();
    const view = await renderNative(
      <AndroidChoice
        mode="menu"
        label="Effort"
        value="easy"
        options={options}
        onChange={change}
        testId="popup"
      />,
    );
    await fireEvent.press(view.getByTestId("popup"));
    expect(Keyboard.dismiss).toHaveBeenCalled();
    expect(view.container.queryAll((node) => node.type === "ComposeMenu")[0]?.props.expanded).toBe(
      true,
    );
    const item = view.container.queryAll((node) => node.type === "ComposeMenuItem")[1];
    if (!item) throw new Error("Expected the second native popup item.");
    await fireEvent(item, "click");
    expect(change).toHaveBeenCalledTimes(1);
    item?.props.onClick();
    expect(change).toHaveBeenCalledTimes(1);
    expect(view.container.queryAll((node) => node.type === "ComposeMenu")[0]?.props.expanded).toBe(
      false,
    );
  });
});
