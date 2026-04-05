import React from "react";
import { renderNative, screen } from "../../../test/render-native";

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: createHost("Button"),
}));

jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
  CardHeader: createHost("CardHeader"),
}));

jest.mock("@repo/ui/components/icon", () => ({
  __esModule: true,
  Icon: createHost("Icon"),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  Activity: createHost("Activity"),
  Calendar: createHost("Calendar"),
  Play: createHost("Play"),
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
