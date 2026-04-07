import React from "react";
import { renderNative } from "../../../../test/render-native";

const localSearchParamsMock = {
  planId: "plan-123",
  id: "fallback-456",
  eventId: "event-789",
  action: "schedule",
  template: '{"id":"template-1"}',
  activityPlan: '{"id":"activity-1"}',
};

const activityPlanDetailScreenMock = jest.fn((props?: any) =>
  React.createElement("ActivityPlanDetailScreen", props),
);

jest.mock("expo-router", () => ({
  __esModule: true,
  useLocalSearchParams: () => localSearchParamsMock,
}));

jest.mock("@/components/activity-plan/ActivityPlanDetailScreen", () => ({
  __esModule: true,
  ActivityPlanDetailScreen: (props: any) => activityPlanDetailScreenMock(props),
}));

const ActivityPlanDetailRoute = require("../activity-plan-detail").default;

describe("activity plan detail route", () => {
  beforeEach(() => {
    activityPlanDetailScreenMock.mockClear();
  });

  it("passes normalized params into the feature screen", () => {
    renderNative(<ActivityPlanDetailRoute />);

    expect((activityPlanDetailScreenMock.mock.calls as any[])[0]?.[0]).toEqual(
      expect.objectContaining({
        planId: "plan-123",
        fallbackId: "fallback-456",
        eventId: "event-789",
        action: "schedule",
        template: '{"id":"template-1"}',
        activityPlan: '{"id":"activity-1"}',
      }),
    );
  });
});
