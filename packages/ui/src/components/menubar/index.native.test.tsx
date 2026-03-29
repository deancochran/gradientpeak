import { renderNative } from "../../test/render-native";
import { Menubar, MenubarContent, MenubarItem, MenubarMenu, MenubarTrigger } from "./index.native";

describe("Menubar native", () => {
  it("renders menu trigger and item text", () => {
    const { getByTestId } = renderNative(
      <Menubar onValueChange={() => {}} value="file">
        <MenubarMenu value="file">
          <MenubarTrigger testID="file-menu-trigger">File</MenubarTrigger>
          <MenubarContent testID="file-menu-content">
            <MenubarItem testID="new-workout-item">New workout</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>,
    );

    expect(getByTestId("file-menu-trigger")).toBeTruthy();
    expect(getByTestId("file-menu-content")).toBeTruthy();
    expect(getByTestId("new-workout-item")).toBeTruthy();
  });
});
