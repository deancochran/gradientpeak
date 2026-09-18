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

describe("standard layout user route declarations", () => {
  it("registers canonical user and settings routes", async () => {
    await renderNative(<StandardLayout />);

    expect(screen.getByTestId("stack-screen-user/[userId]")).toBeTruthy();
    expect(screen.getByTestId("stack-screen-settings")).toBeTruthy();
    expect(screen.getByTestId("stack-screen-me")).toBeTruthy();
  });

  it("registers the nested notifications index route", async () => {
    await renderNative(<StandardLayout />);

    expect(screen.getByTestId("stack-screen-notifications/index")).toBeTruthy();
    expect(screen.queryByTestId("stack-screen-notifications")).toBeNull();
  });
});
