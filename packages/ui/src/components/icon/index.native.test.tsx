import { CircleAlert } from "lucide-react-native";

import { renderNative } from "../../test/render-native";
import { Icon } from "./index.native";

describe("Icon native", () => {
  it("renders the requested icon component", () => {
    const { getByTestId } = renderNative(
      <Icon as={CircleAlert} size={18} testID="status-icon" />,
    );

    expect(getByTestId("status-icon")).toBeTruthy();
  });
});
