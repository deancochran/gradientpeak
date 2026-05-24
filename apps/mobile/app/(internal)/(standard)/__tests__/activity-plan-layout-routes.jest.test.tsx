import {
  createHost as mockCreateHost,
  createStackComponent as mockCreateStackComponent,
} from "../../../../test/mock-components";
import { renderNative, screen } from "../../../../test/render-native";

jest.mock("expo-router", () => ({
  __esModule: true,
  useRouter: () => ({ back: jest.fn() }),
  Stack: mockCreateStackComponent(),
}));

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  TouchableOpacity: mockCreateHost("TouchableOpacity"),
}));

jest.mock("@repo/ui/components/icon", () => ({
  __esModule: true,
  Icon: mockCreateHost("Icon"),
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  ChevronLeft: mockCreateHost("ChevronLeft"),
}));

const StandardLayout = require("../_layout").default;

describe("standard layout activity-plan route declarations", () => {
  it("keeps unified composer entry and excludes legacy structure/repeat screens", () => {
    renderNative(<StandardLayout />);

    expect(screen.getByTestId("stack-screen-activity-plan-detail")).toBeTruthy();
    expect(screen.getByTestId("stack-screen-create-activity-plan")).toBeTruthy();
    expect(screen.getByTestId("stack-screen-scheduled-activities-list")).toBeTruthy();
    expect(screen.queryByTestId("stack-screen-create-activity-plan-structure")).toBeNull();
    expect(screen.queryByTestId("stack-screen-create-activity-plan-repeat")).toBeNull();
  });
});
