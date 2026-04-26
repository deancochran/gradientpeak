import React from "react";
import { fireEvent, renderNative, screen } from "../../../test/render-native";
import { UpcomingActivitiesCard } from "../UpcomingActivitiesCard";

const navigateToMock = jest.fn();

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  TouchableOpacity: createHost("TouchableOpacity"),
  View: createHost("View"),
}));

jest.mock("@repo/core", () => ({
  __esModule: true,
  formatDurationSec: jest.fn(() => "60 min"),
}));

jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => navigateToMock,
}));

jest.mock("@/lib/constants/routes", () => ({
  __esModule: true,
  ROUTES: {
    PLAN: {
      ACTIVITY_DETAIL: (activityId: string) => `/event-detail?id=${activityId}`,
    },
  },
}));

describe("UpcomingActivitiesCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows a subtle provenance cue for scheduled training-plan activities", () => {
    renderNative(
      <UpcomingActivitiesCard
        activities={[
          {
            id: "event-1",
            scheduled_date: "2026-03-23",
            training_plan_id: "plan-123",
            activity_plan: {
              id: "activity-plan-1",
              name: "Tempo Builder",
              activity_category: "outdoor_run",
              authoritative_metrics: {
                estimated_duration: 3600,
                estimated_tss: 72,
              },
            },
          },
        ]}
      />,
    );

    expect(screen.getByText("From training plan")).toBeTruthy();

    fireEvent.press(screen.getByText("Tempo Builder"));

    expect(navigateToMock).toHaveBeenCalledWith("/event-detail?id=event-1");
  });
});
