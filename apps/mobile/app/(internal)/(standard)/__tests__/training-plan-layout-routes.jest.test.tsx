import {
  createHost as mockCreateHost,
  createStackComponent as mockCreateStackComponent,
} from "../../../../test/mock-components";
import { renderNative, screen } from "../../../../test/render-native";

jest.mock("expo-router", () => ({
  __esModule: true,
  useRouter: () => ({
    back: jest.fn(),
  }),
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

describe("standard layout training-plan route declarations", () => {
  it("keeps canonical routes and excludes deprecated legacy entries", () => {
    renderNative(<StandardLayout />);

    expect(screen.getByTestId("stack-screen-training-plan-detail")).toBeTruthy();
    expect(screen.getByTestId("stack-screen-training-plans-list")).toBeTruthy();
    expect(screen.getByTestId("stack-screen-training-plan-create")).toBeTruthy();
    expect(screen.getByTestId("stack-screen-training-plan-edit").props.options).toMatchObject({
      title: "Edit Training Plan",
    });

    expect(screen.queryByTestId("stack-screen-training-plan-adjust")).toBeNull();
    expect(screen.queryByTestId("stack-screen-training-plan-method-selector")).toBeNull();
    expect(screen.queryByTestId("stack-screen-training-plan-wizard")).toBeNull();
    expect(screen.queryByTestId("stack-screen-training-plan-review")).toBeNull();
  });
});
