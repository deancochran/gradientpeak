import { renderNative } from "../../test/render-native";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "./index.native";

describe("DropdownMenu native", () => {
  it("renders trigger text and item content", () => {
    const { getByTestId } = renderNative(
      <DropdownMenu>
        <DropdownMenuTrigger testID="activity-menu-trigger">Open menu</DropdownMenuTrigger>
        <DropdownMenuContent testID="activity-menu-content">
          <DropdownMenuItem testID="pin-activity-item">Pin activity</DropdownMenuItem>
          <DropdownMenuShortcut testID="pin-activity-shortcut">Shift+P</DropdownMenuShortcut>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    expect(getByTestId("activity-menu-trigger")).toBeTruthy();
    expect(getByTestId("activity-menu-content")).toBeTruthy();
    expect(getByTestId("pin-activity-item")).toBeTruthy();
    expect(getByTestId("pin-activity-shortcut")).toBeTruthy();
  });
});
