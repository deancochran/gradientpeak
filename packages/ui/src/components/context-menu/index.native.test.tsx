import { Text } from "react-native";
import { renderNative } from "../../test/render-native";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "./index.native";

describe("ContextMenu native", () => {
  it("renders trigger and menu item content", async () => {
    const { getByTestId } = await renderNative(
      <ContextMenu>
        <ContextMenuTrigger testID="session-options-trigger">
          <Text>Session options</Text>
        </ContextMenuTrigger>
        <ContextMenuContent testID="session-options-content">
          <ContextMenuItem testID="duplicate-activity-item">
            <Text>Duplicate activity</Text>
          </ContextMenuItem>
          <ContextMenuShortcut testID="duplicate-activity-shortcut">
            <Text>Cmd+D</Text>
          </ContextMenuShortcut>
        </ContextMenuContent>
      </ContextMenu>,
    );

    expect(getByTestId("session-options-trigger")).toBeTruthy();
    expect(getByTestId("session-options-content")).toBeTruthy();
    expect(getByTestId("duplicate-activity-item")).toBeTruthy();
    expect(getByTestId("duplicate-activity-shortcut")).toBeTruthy();
  });
});
