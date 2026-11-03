import { Text } from "react-native";
import { renderNative } from "../../test/render-native";
import { Menubar, MenubarContent, MenubarItem, MenubarMenu, MenubarTrigger } from "./index.native";

describe("Menubar native", () => {
  it("renders menu trigger and item text", async () => {
    const { getByTestId } = await renderNative(
      <Menubar onValueChange={() => {}} value="file">
        <MenubarMenu value="file">
          <MenubarTrigger testID="file-menu-trigger">
            <Text>File</Text>
          </MenubarTrigger>
          <MenubarContent testID="file-menu-content">
            <MenubarItem testID="new-activity-item">
              <Text>New activity</Text>
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>,
    );

    expect(getByTestId("file-menu-trigger")).toBeTruthy();
    expect(getByTestId("file-menu-content")).toBeTruthy();
    expect(getByTestId("new-activity-item")).toBeTruthy();
  });
});
