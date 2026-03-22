import { fireEvent, renderNative } from "../../test/render-native";
import { SettingItem, SettingsGroup } from "./index.native";

describe("SettingsGroup native", () => {
  it("renders setting items and forwards actions", () => {
    const onValueChange = jest.fn();

    const { getByTestId, getByText } = renderNative(
      <SettingsGroup title="Account" testID="account-section">
        <SettingItem
          type="toggle"
          label="Private account"
          value={false}
          onValueChange={onValueChange}
          testID="private-account"
        />
      </SettingsGroup>,
    );

    expect(getByText("Account")).toBeTruthy();
    fireEvent(getByTestId("private-account-switch"), "onCheckedChange", true);
    expect(onValueChange).toHaveBeenCalledWith(true);
  });
});
