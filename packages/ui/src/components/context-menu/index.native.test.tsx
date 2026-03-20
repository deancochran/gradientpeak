import { renderNative } from "../../test/render-native";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "./index.native";

describe("ContextMenu native", () => {
  it("renders trigger and menu item content", () => {
    const { getByTestId } = renderNative(
      <ContextMenu>
        <ContextMenuTrigger testID="session-options-trigger">
          Session options
        </ContextMenuTrigger>
        <ContextMenuContent testID="session-options-content">
          <ContextMenuItem testID="duplicate-workout-item">
            Duplicate workout
          </ContextMenuItem>
          <ContextMenuShortcut testID="duplicate-workout-shortcut">
            Cmd+D
          </ContextMenuShortcut>
        </ContextMenuContent>
      </ContextMenu>,
    );

    expect(getByTestId("session-options-trigger")).toBeTruthy();
    expect(getByTestId("session-options-content")).toBeTruthy();
    expect(getByTestId("duplicate-workout-item")).toBeTruthy();
    expect(getByTestId("duplicate-workout-shortcut")).toBeTruthy();
  });
});
