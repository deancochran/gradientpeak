import React, { type ComponentProps } from "react";
import { createHost as mockCreateHost } from "../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../test/render-native";
import { GroupEventCard } from "../GroupEventCards";
import { GroupEventDetailScreen } from "../GroupEventDetail";

const activityPlanPressMock = jest.fn();
const occurrencePressMock = jest.fn();
const rsvpMock = jest.fn();
const rsvpSeriesMock = jest.fn();

type GroupEventFixture = NonNullable<ComponentProps<typeof GroupEventDetailScreen>["event"]>;
type ActivityPlanFixture = { id: string; name: string };
function createViewerRsvp(
  status: NonNullable<GroupEventFixture["viewerRsvp"]>["status"],
): NonNullable<GroupEventFixture["viewerRsvp"]> {
  return {
    group_event_id: "group-event-1",
    profile_id: "viewer-1",
    status,
    created_at: "2026-05-20T12:00:00.000Z",
    updated_at: "2026-05-20T12:00:00.000Z",
  };
}

function createViewerSeriesRsvp(
  status: NonNullable<GroupEventFixture["viewerSeriesRsvp"]>["status"],
): NonNullable<GroupEventFixture["viewerSeriesRsvp"]> {
  return {
    group_event_series_id: "series-1",
    profile_id: "viewer-1",
    status,
    created_at: "2026-05-20T12:00:00.000Z",
    updated_at: "2026-05-20T12:00:00.000Z",
  };
}

let activityPlanItems: ActivityPlanFixture[] = [];

function createGroupEvent(overrides: Partial<GroupEventFixture> = {}): GroupEventFixture {
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
    activity_plan_id: null,
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
  ActivityPlanCard: ({
    activityPlan,
    onPress,
  }: {
    activityPlan: ActivityPlanFixture;
    onPress?: () => void;
  }) =>
    React.createElement(
      "ActivityPlanCard",
      { onPress, testID: `activity-plan-card-${activityPlan.id}` },
      activityPlan.name,
    ),
}));

jest.mock("@/components/shared/AppFormModal", () => ({
  __esModule: true,
  AppFormModal: ({
    children,
    testID,
    title,
  }: {
    children?: React.ReactNode;
    testID?: string;
    title?: React.ReactNode;
  }) => React.createElement("View", { testID }, React.createElement("Text", null, title), children),
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
      <GroupEventDetailScreen event={createGroupEvent()} onGroupPress={groupPressMock} />,
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
        event={createGroupEvent()}
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
        event={createGroupEvent({
          id: "occurrence-1",
          series_id: "series-1",
          occurrence_key: "2026-05-21",
          is_recurring_occurrence: true,
          viewerSeriesRsvp: createViewerSeriesRsvp("accepted"),
        })}
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
    renderNative(<GroupEventDetailScreen event={createGroupEvent()} />);

    expect(screen.getByText("Trail Crew")).toBeTruthy();
    expect(screen.getByText("Saturday long run")).toBeTruthy();
    expect(screen.queryByText("Event details")).toBeNull();
    expect(screen.queryByText("Created by creator-1")).toBeNull();
  });

  it("allows clearing or returning an occurrence RSVP to tentative", () => {
    renderNative(
      <GroupEventDetailScreen
        event={createGroupEvent({
          viewerRsvp: createViewerRsvp("accepted"),
        })}
        onRsvp={rsvpMock}
      />,
    );

    fireEvent.press(screen.getByText("Tentative"));
    fireEvent.press(screen.getByText("Clear"));

    expect(rsvpMock).toHaveBeenCalledWith("tentative");
    expect(rsvpMock).toHaveBeenCalledWith(null);
  });

  it("shows accepted RSVP counts and renders future dates from passed occurrences", () => {
    renderNative(
      <GroupEventDetailScreen
        event={createGroupEvent({ acceptedRsvpCount: 3, is_recurring_series: true })}
        futureOccurrences={[
          createGroupEvent({
            id: "occurrence-2",
            acceptedRsvpCount: 1,
            series_id: "series-1",
            title: "Next Saturday long run",
          }),
        ]}
        onOccurrencePress={occurrencePressMock}
      />,
    );

    expect(screen.getByText("3 going")).toBeTruthy();
    expect(screen.getByText("Future dates")).toBeTruthy();
    expect(screen.getByText("1 going")).toBeTruthy();

    fireEvent.press(screen.getByText("Next Saturday long run"));
    expect(occurrencePressMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "occurrence-2" }),
    );
  });

  it("does not render future-date state for one-off events", () => {
    renderNative(<GroupEventDetailScreen event={createGroupEvent()} futureOccurrences={[]} />);

    expect(screen.queryByText("Future dates")).toBeNull();
    expect(screen.queryByText("No future dates.")).toBeNull();
  });

  it("renders an empty future-date state for recurring events", () => {
    renderNative(
      <GroupEventDetailScreen
        event={createGroupEvent({ is_recurring_series: true })}
        futureOccurrences={[]}
      />,
    );

    expect(screen.getByText("No future dates.")).toBeTruthy();
  });

  it("excludes the viewed occurrence and orders remaining future dates chronologically", () => {
    const rendered = renderNative(
      <GroupEventDetailScreen
        event={createGroupEvent({ id: "occurrence-current", is_recurring_occurrence: true })}
        futureOccurrences={[
          createGroupEvent({
            id: "occurrence-later",
            starts_at: "2026-06-07T13:00:00.000Z",
            title: "Later occurrence",
          }),
          createGroupEvent({ id: "occurrence-current", title: "Current occurrence duplicate" }),
          createGroupEvent({
            id: "occurrence-next",
            starts_at: "2026-05-28T13:00:00.000Z",
            title: "Next occurrence",
          }),
        ]}
      />,
    );
    const tree = JSON.stringify(rendered.toJSON());

    expect(screen.queryByText("Current occurrence duplicate")).toBeNull();
    expect(tree.indexOf("Next occurrence")).toBeLessThan(tree.indexOf("Later occurrence"));
  });

  it("renders the singular activity plan when it is visible to the viewer", () => {
    activityPlanItems = [{ id: "plan-visible", name: "Visible tempo plan" }];

    renderNative(
      <GroupEventDetailScreen
        event={createGroupEvent({
          activity_plan_id: "plan-visible",
        })}
        onActivityPlanPress={activityPlanPressMock}
        onRsvp={rsvpMock}
      />,
    );

    expect(screen.getByTestId("activity-plan-card-plan-visible")).toBeTruthy();

    fireEvent.press(screen.getByTestId("activity-plan-card-plan-visible"));

    expect(activityPlanPressMock).toHaveBeenCalledWith("plan-visible");
  });

  it("places the linked activity plan before RSVP actions", () => {
    activityPlanItems = [{ id: "plan-visible", name: "Visible tempo plan" }];

    const rendered = renderNative(
      <GroupEventDetailScreen
        event={createGroupEvent({ activity_plan_id: "plan-visible" })}
        onRsvp={rsvpMock}
      />,
    );
    const tree = JSON.stringify(rendered.toJSON());

    expect(tree.indexOf("Visible tempo plan")).toBeLessThan(tree.indexOf("Your RSVP"));
  });

  it("omits the retired occurrence plan copy action for event managers", () => {
    renderNative(
      <GroupEventDetailScreen
        canManage
        event={createGroupEvent({
          id: "occurrence-1",
          series_id: "series-1",
          occurrence_key: "2026-05-21",
          is_recurring_occurrence: true,
        })}
      />,
    );

    expect(screen.queryByText("Copy series plans to occurrence")).toBeNull();
  });
});
