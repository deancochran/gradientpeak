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
        <DropdownMenuTrigger testID="workout-menu-trigger">Open menu</DropdownMenuTrigger>
        <DropdownMenuContent testID="workout-menu-content">
          <DropdownMenuItem testID="pin-workout-item">Pin workout</DropdownMenuItem>
          <DropdownMenuShortcut testID="pin-workout-shortcut">Shift+P</DropdownMenuShortcut>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    expect(getByTestId("workout-menu-trigger")).toBeTruthy();
    expect(getByTestId("workout-menu-content")).toBeTruthy();
    expect(getByTestId("pin-workout-item")).toBeTruthy();
    expect(getByTestId("pin-workout-shortcut")).toBeTruthy();
  });
});
