import React from "react";
import { createHost as mockCreateHost } from "../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../test/render-native";
import { GroupEventDetailScreen } from "../GroupEventDetail";

const activityPlanPressMock = jest.fn();
const occurrencePressMock = jest.fn();
const rsvpMock = jest.fn();
const rsvpSeriesMock = jest.fn();

let activityPlanItems: any[] = [];

function createGroupEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "group-event-1",
    group_id: "group-1",
    title: "Saturday long run",
    description: "Meet by the trailhead.",
    starts_at: "2026-05-21T13:00:00.000Z",
    ends_at: "2026-05-21T14:00:00.000Z",
    timezone: "America/New_York",
    location_name: "River path",
    route_id: null,
    cancelled_at: null,
    recurrence_rule: null,
    recurrence_timezone: null,
    series_id: null,
    occurrence_key: null,
    is_recurring_series: false,
    is_recurring_occurrence: false,
    activityPlanOptions: [],
    viewerRsvp: null,
    viewerSeriesRsvp: null,
    group: { id: "group-1", name: "Trail Crew" },
    ...overrides,
  };
}

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  TouchableOpacity: mockCreateHost("TouchableOpacity"),
  View: mockCreateHost("View"),
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: mockCreateHost("Button"),
}));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: mockCreateHost("Text") }));

jest.mock("@/components/shared/ActivityPlanCard", () => ({
  __esModule: true,
  ActivityPlanCard: ({ activityPlan, onPress }: any) =>
    React.createElement(
      "ActivityPlanCard",
      { onPress, testID: `activity-plan-card-${activityPlan.id}` },
      activityPlan.name,
    ),
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  CalendarDays: mockCreateHost("CalendarDays"),
  MapPin: mockCreateHost("MapPin"),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    activityPlans: {
      getManyByIds: {
        useQuery: () => ({ data: { items: activityPlanItems }, isLoading: false }),
      },
    },
  },
}));

describe("GroupEventDetailScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    activityPlanItems = [];
  });

  it("shows recurring occurrence state, future occurrence navigation, and series RSVP", () => {
    const futureOccurrence = createGroupEvent({
      id: "occurrence-2",
      series_id: "series-1",
      title: "Next Saturday long run",
      starts_at: "2026-05-28T13:00:00.000Z",
    });

    renderNative(
      <GroupEventDetailScreen
        event={
          createGroupEvent({
            id: "occurrence-1",
            series_id: "series-1",
            occurrence_key: "2026-05-21",
            is_recurring_occurrence: true,
            viewerSeriesRsvp: { status: "accepted" },
          }) as any
        }
        futureOccurrences={[futureOccurrence as any]}
        onOccurrencePress={occurrencePressMock}
        onRsvpSeries={rsvpSeriesMock}
      />,
    );

    expect(screen.getByText("Series occurrence")).toBeTruthy();
    expect(screen.getByText("Series RSVP · Going")).toBeTruthy();
    expect(screen.getByText("Future dates")).toBeTruthy();

    fireEvent.press(screen.getByText("Next Saturday long run"));
    fireEvent.press(screen.getByText("Decline series"));

    expect(occurrencePressMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "occurrence-2" }),
    );
    expect(rsvpSeriesMock).toHaveBeenCalledWith("declined");
  });

  it("does not render activity plan details that are not visible to the viewer", () => {
    activityPlanItems = [{ id: "plan-visible", name: "Visible tempo plan" }];

    renderNative(
      <GroupEventDetailScreen
        event={
          createGroupEvent({
            activityPlanOptions: [
              {
                id: "option-visible",
                activity_plan_id: "plan-visible",
                label: "Tempo",
                sort_order: 0,
              },
              {
                id: "option-private",
                activity_plan_id: "plan-private",
                label: "Private",
                sort_order: 1,
              },
            ],
          }) as any
        }
        onActivityPlanPress={activityPlanPressMock}
        onRsvp={rsvpMock}
      />,
    );

    expect(screen.getByTestId("activity-plan-card-plan-visible")).toBeTruthy();
    expect(screen.getByText("1 activity plan is not available to view.")).toBeTruthy();
    expect(screen.queryByText("plan-private")).toBeNull();

    fireEvent.press(screen.getByTestId("activity-plan-card-plan-visible"));
    fireEvent.press(screen.getByText("Private"));

    expect(activityPlanPressMock).toHaveBeenCalledWith("plan-visible");
    expect(rsvpMock).toHaveBeenCalledWith("accepted", "option-private");
  });

  it("limits occurrence override copy actions to event managers", () => {
    const copySeriesPlansMock = jest.fn();
    const occurrence = createGroupEvent({
      id: "occurrence-1",
      series_id: "series-1",
      occurrence_key: "2026-05-21",
      is_recurring_occurrence: true,
    });

    const { rerender } = renderNative(
      <GroupEventDetailScreen
        canManage={false}
        event={occurrence as any}
        onCopySeriesPlans={copySeriesPlansMock}
      />,
    );

    expect(screen.queryByText("Copy series plans to occurrence")).toBeNull();

    rerender(
      <GroupEventDetailScreen
        canManage
        event={occurrence as any}
        onCopySeriesPlans={copySeriesPlansMock}
      />,
    );

    fireEvent.press(screen.getByText("Copy series plans to occurrence"));
    expect(copySeriesPlansMock).toHaveBeenCalledTimes(1);
  });
});
