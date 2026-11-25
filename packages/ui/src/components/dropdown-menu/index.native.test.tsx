import { Text } from "react-native";
import { renderNative } from "../../test/render-native";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "./index.native";

describe("DropdownMenu native", () => {
  it("renders trigger text and item content", async () => {
    const { getByTestId } = await renderNative(
      <DropdownMenu>
        <DropdownMenuTrigger testID="activity-menu-trigger">
          <Text>Open menu</Text>
        </DropdownMenuTrigger>
        <DropdownMenuContent testID="activity-menu-content">
          <DropdownMenuItem testID="pin-activity-item">
            <Text>Pin activity</Text>
          </DropdownMenuItem>
          <DropdownMenuShortcut testID="pin-activity-shortcut">
            <Text>Shift+P</Text>
          </DropdownMenuShortcut>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    expect(getByTestId("activity-menu-trigger")).toBeTruthy();
    expect(getByTestId("activity-menu-content")).toBeTruthy();
    expect(getByTestId("pin-activity-item")).toBeTruthy();
    expect(getByTestId("pin-activity-shortcut")).toBeTruthy();
  });
});
