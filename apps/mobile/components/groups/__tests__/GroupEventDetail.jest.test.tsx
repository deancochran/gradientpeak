import React from "react";
import { createHost as mockCreateHost } from "../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../test/render-native";
import { CurrentGroupEventPlanCard, GroupEventCard } from "../GroupEventCards";
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
    created_by_profile_id: "creator-1",
    created_at: "2026-05-20T12:00:00.000Z",
    updated_at: "2026-05-21T12:00:00.000Z",
    cancelled_at: null,
    recurrence_rule: null,
    recurrence_timezone: null,
    series_id: null,
    occurrence_key: null,
    is_recurring_series: false,
    is_recurring_occurrence: false,
    acceptedRsvpCount: 0,
    activityPlanOptions: [],
    viewerRsvp: null,
    viewerSeriesRsvp: null,
    group: { id: "group-1", name: "Trail Crew", slug: "trail-crew", avatar_url: null },
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
jest.mock("@repo/ui/components/avatar", () => ({
  __esModule: true,
  Avatar: mockCreateHost("Avatar"),
  AvatarFallback: mockCreateHost("AvatarFallback"),
  AvatarImage: mockCreateHost("AvatarImage"),
}));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: mockCreateHost("Text") }));

jest.mock("@/lib/server-config", () => ({
  __esModule: true,
  getReachableSupabaseStorageUrl: (url: string) => url,
}));

jest.mock("@/components/shared/ActivityPlanCard", () => ({
  __esModule: true,
  ActivityPlanCard: ({ activityPlan, onPress }: any) =>
    React.createElement(
      "ActivityPlanCard",
      { onPress, testID: `activity-plan-card-${activityPlan.id}` },
      activityPlan.name,
    ),
}));

jest.mock("@/components/shared/AppFormModal", () => ({
  __esModule: true,
  AppFormModal: ({ children, testID, title }: any) =>
    React.createElement("View", { testID }, React.createElement("Text", null, title), children),
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

  it("shows the owning group with avatar fallback and opens group details", () => {
    const groupPressMock = jest.fn();

    renderNative(
      <GroupEventDetailScreen event={createGroupEvent() as any} onGroupPress={groupPressMock} />,
    );

    expect(screen.getByText("Trail Crew")).toBeTruthy();
    expect(screen.getByText("@trail-crew")).toBeTruthy();
    expect(screen.getByText("TC")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Open group Trail Crew"));

    expect(groupPressMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "group-1", name: "Trail Crew" }),
    );
  });

  it("keeps group ownership first and separate from opening the event card", () => {
    const eventPressMock = jest.fn();
    const groupPressMock = jest.fn();
    const stopPropagationMock = jest.fn();

    renderNative(
      <GroupEventCard
        event={createGroupEvent() as any}
        onGroupPress={groupPressMock}
        onPress={eventPressMock}
        variant="compact"
      />,
    );

    fireEvent.press(screen.getByLabelText("Open group Trail Crew"), {
      stopPropagation: stopPropagationMock,
    });

    expect(stopPropagationMock).toHaveBeenCalledTimes(1);
    expect(groupPressMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "group-1", name: "Trail Crew" }),
    );
    expect(eventPressMock).not.toHaveBeenCalled();
  });

  it("keeps series RSVP behind a lightweight apply action", () => {
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
        onRsvpSeries={rsvpSeriesMock}
      />,
    );

    expect(screen.queryByText("Series occurrence")).toBeNull();
    expect(screen.queryByText("Recurring series")).toBeNull();
    expect(screen.queryByText("One-time event")).toBeNull();
    expect(screen.getByText("Repeating event")).toBeTruthy();
    expect(screen.getByText("Your RSVP is for this date · Series is Going.")).toBeTruthy();
    expect(screen.queryByText("Future dates")).toBeNull();
    expect(screen.queryByText("Decline series")).toBeNull();

    fireEvent.press(screen.getByText("Apply to series"));
    fireEvent.press(screen.getByText("Decline series"));

    expect(rsvpSeriesMock).toHaveBeenCalledWith("declined");
  });

  it("keeps the event detail layout minimal", () => {
    renderNative(<GroupEventDetailScreen event={createGroupEvent() as any} />);

    expect(screen.getByText("Trail Crew")).toBeTruthy();
    expect(screen.getByText("Saturday long run")).toBeTruthy();
    expect(screen.queryByText("Event details")).toBeNull();
    expect(screen.queryByText("Created by creator-1")).toBeNull();
  });

  it("allows clearing or returning an occurrence RSVP to tentative", () => {
    renderNative(
      <GroupEventDetailScreen
        event={
          createGroupEvent({
            viewerRsvp: {
              status: "accepted",
              selected_group_event_activity_plan_id: null,
            },
          }) as any
        }
        onRsvp={rsvpMock}
      />,
    );

    fireEvent.press(screen.getByText("Tentative"));
    fireEvent.press(screen.getByText("Clear"));

    expect(rsvpMock).toHaveBeenCalledWith("tentative", null);
    expect(rsvpMock).toHaveBeenCalledWith(null, null);
  });

  it("does not label current group events as plans without activity plan options", () => {
    renderNative(<CurrentGroupEventPlanCard event={createGroupEvent() as any} />);

    expect(screen.getByText("Current / next event")).toBeTruthy();
    expect(screen.queryByText("Current / next plan")).toBeNull();
  });

  it("shows accepted RSVP counts on the detail header without future dates", () => {
    renderNative(
      <GroupEventDetailScreen
        event={createGroupEvent({ acceptedRsvpCount: 3, is_recurring_series: true }) as any}
        futureOccurrences={[
          createGroupEvent({
            id: "occurrence-2",
            acceptedRsvpCount: 1,
            series_id: "series-1",
            title: "Next Saturday long run",
          }) as any,
        ]}
        onOccurrencePress={occurrencePressMock}
      />,
    );

    expect(screen.getByText("3 going")).toBeTruthy();
    expect(screen.queryByText("1 going")).toBeNull();
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
