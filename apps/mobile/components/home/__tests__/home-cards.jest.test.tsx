import { createHost as mockCreateHost } from "../../../test/mock-components";
import { renderNative, screen } from "../../../test/render-native";

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: mockCreateHost("Button"),
}));

jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: mockCreateHost("Card"),
  CardContent: mockCreateHost("CardContent"),
  CardHeader: mockCreateHost("CardHeader"),
}));

jest.mock("@repo/ui/components/icon", () => ({
  __esModule: true,
  Icon: mockCreateHost("Icon"),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: mockCreateHost("Text"),
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  Activity: mockCreateHost("Activity"),
  Calendar: mockCreateHost("Calendar"),
  Play: mockCreateHost("Play"),
}));

const { TodaysFocusCard } = require("../TodaysFocusCard");
const TodaysTrainingCard = require("../TodaysTrainingCard").default;

describe("home cards", () => {
  it("does not switch TodaysFocusCard into a rest variant from legacy rest strings", () => {
    renderNative(
      <TodaysFocusCard
        todaysActivity={{
          id: "activity-1",
          type: "rest_day",
          title: "Rest Day",
          duration: 30,
          distance: 0,
          zone: null,
          scheduledTime: "9:00 AM",
          description: "Legacy label only",
        }}
        onStartActivity={jest.fn()}
        onViewPlan={jest.fn()}
        onPress={jest.fn()}
      />,
    );

    expect(screen.getByText("Start")).toBeTruthy();
    expect(screen.queryByText("View Full Week")).toBeNull();
    expect(
      screen.queryByText(
        "Recovery is just as important as training. Take time to rest and let your body adapt.",
      ),
    ).toBeNull();
  });

  it("does not switch TodaysTrainingCard into a rest variant from legacy rest strings", () => {
    renderNative(
      <TodaysTrainingCard
        todaysActivity={{
          title: "Rest Day",
          type: "rest_day",
          distance: 4,
          duration: 32,
          description: "Legacy label only",
        }}
        onStartActivity={jest.fn()}
        onViewPlan={jest.fn()}
      />,
    );

    expect(screen.getByText("Start Activity")).toBeTruthy();
    expect(screen.getByText("4 mi")).toBeTruthy();
    expect(screen.queryByText("View Full Week")).toBeNull();
    expect(
      screen.queryByText(
        "Active recovery day. Focus on hydration, nutrition, and light stretching.",
      ),
    ).toBeNull();
  });
});
