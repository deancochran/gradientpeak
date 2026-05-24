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

describe("standard layout plan detail routes", () => {
  it("declares event, goal, preferences, and training plan list screens", () => {
    renderNative(<StandardLayout />);

    expect(screen.getByTestId("stack-screen-event-detail").props.options).toMatchObject({
      title: "Event Details",
    });
    expect(screen.getByTestId("stack-screen-event-detail-update").props.options).toMatchObject({
      title: "Update Event",
    });
    expect(screen.getByTestId("stack-screen-goal-detail").props.options).toMatchObject({
      title: "Goal Details",
    });
    expect(screen.getByTestId("stack-screen-training-preferences").props.options).toMatchObject({
      title: "Training Preferences",
    });
    expect(screen.getByTestId("stack-screen-training-plans-list").props.options).toMatchObject({
      title: "My Training Plans",
    });
  });
});
