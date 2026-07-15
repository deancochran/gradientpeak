import { createHost } from "../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../test/render-native";

const navigateTo = jest.fn();

jest.mock("react-native", () => ({
  ...jest.requireActual("@repo/ui/test/react-native"),
  Pressable: createHost("Pressable"),
  View: createHost("View"),
}));
jest.mock("@repo/ui/components/text", () => ({ Text: createHost("Text") }));
jest.mock("lucide-react-native", () => ({
  Bike: createHost("Bike"),
  Footprints: createHost("Footprints"),
  Users: createHost("Users"),
}));
jest.mock("@/lib/navigation/useAppNavigate", () => ({ useAppNavigate: () => navigateTo }));

const { FeedEmptyState } = require("../FeedEmptyState");

it("offers accessible record and athlete discovery actions", () => {
  renderNative(<FeedEmptyState />);
  const record = screen.getByTestId("feed-empty-record");
  const discover = screen.getByTestId("feed-empty-find-athletes");
  expect(record.props.accessibilityRole).toBe("button");
  expect(discover.props.accessibilityRole).toBe("button");
  fireEvent.press(record);
  fireEvent.press(discover);
  expect(navigateTo).toHaveBeenNthCalledWith(1, "/record");
  expect(navigateTo).toHaveBeenNthCalledWith(2, "/search");
});
