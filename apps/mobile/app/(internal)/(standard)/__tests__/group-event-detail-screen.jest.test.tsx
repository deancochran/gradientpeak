import React from "react";

import { createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";

const pushMock = jest.fn();
const alertMock = jest.fn();
const localSearchParamsMock = { groupEventId: "33333333-3333-4333-8333-333333333333" };
const refetchMock = jest.fn(async () => undefined);
const rsvpEventSeriesMock = jest.fn(async () => undefined);
const cancelEventMock = jest.fn(async () => undefined);
const rsvpMock = jest.fn(async () => undefined);

type GroupEventFixture = {
  id: string;
  group_id: string;
  series_id: string | null;
  occurrence_key: string | null;
  created_by_profile_id: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  recurrence_rule: string | null;
  recurrence_timezone: string | null;
  location_name: string;
  route_id: string | null;
  group: { id: string; name: string; slug: string; avatar_url: string | null } | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  is_recurring_series: boolean;
  is_recurring_occurrence: boolean;
  activityPlanOptions: unknown[];
  viewerRsvp: unknown;
  viewerSeriesRsvp: unknown;
};
type OverflowAction = { label: string; onPress?: () => void; testID: string };
type DetailScaffoldProps = React.PropsWithChildren<{
  headerRight?: () => React.ReactNode;
  isLoading?: boolean;
  loadingLabel?: string;
  notFound?: boolean;
  notFoundDescription?: string;
  notFoundTitle?: string;
  screenTestID?: string;
}>;

const baseEvent: GroupEventFixture = {
  id: "33333333-3333-4333-8333-333333333333",
  group_id: "22222222-2222-4222-8222-222222222222",
  series_id: null as string | null,
  occurrence_key: null as string | null,
  created_by_profile_id: "11111111-1111-4111-8111-111111111111",
  title: "Members Ride",
  description: "Private route details",
  starts_at: "2026-05-21T12:00:00.000Z",
  ends_at: "2026-05-21T14:00:00.000Z",
  timezone: "America/New_York",
  recurrence_rule: null as string | null,
  recurrence_timezone: null as string | null,
  location_name: "Clubhouse",
  route_id: null as string | null,
  group: null,
  cancelled_at: null as string | null,
  created_at: "2026-05-21T12:00:00.000Z",
  updated_at: "2026-05-21T12:00:00.000Z",
  is_recurring_series: false,
  is_recurring_occurrence: false,
  activityPlanOptions: [],
  viewerRsvp: null,
  viewerSeriesRsvp: null,
};

const detailVm: {
  detailQuery: Record<string, unknown>;
  event: GroupEventFixture | null;
  error: Error | null;
  isError: boolean;
  isLoading: boolean;
  refetch: typeof refetchMock;
  seriesOccurrences: GroupEventFixture[];
  seriesOccurrencesQuery: { isLoading: boolean };
} = {
  detailQuery: {},
  event: baseEvent,
  error: null as Error | null,
  isError: false,
  isLoading: false,
  refetch: refetchMock,
  seriesOccurrences: [],
  seriesOccurrencesQuery: { isLoading: false },
};

const groupVm = {
  viewer: { canCreateGroupEvent: false },
};

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Alert: { alert: alertMock },
  TouchableOpacity: createHost("TouchableOpacity"),
  View: createHost("View"),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  useLocalSearchParams: () => localSearchParamsMock,
  useRouter: () => ({ push: pushMock }),
}));

jest.mock("@repo/ui/components/button", () => ({ __esModule: true, Button: createHost("Button") }));
jest.mock("@repo/ui/components/avatar", () => ({
  __esModule: true,
  Avatar: createHost("Avatar"),
  AvatarFallback: createHost("AvatarFallback"),
  AvatarImage: createHost("AvatarImage"),
}));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  CalendarDays: createHost("CalendarDays"),
  MapPin: createHost("MapPin"),
}));

jest.mock("@/components/shared/ActivityPlanCard", () => ({
  __esModule: true,
  ActivityPlanCard: createHost("ActivityPlanCard"),
}));

jest.mock("@/components/shared/AppFormModal", () => ({
  __esModule: true,
  AppFormModal: ({
    children,
    testID,
    title,
  }: React.PropsWithChildren<{ testID?: string; title?: string }>) =>
    React.createElement("View", { testID }, React.createElement("Text", null, title), children),
}));

jest.mock("@/components/shared/detail", () => ({
  __esModule: true,
  DetailOverflowMenu: ({ actions }: { actions: OverflowAction[] }) =>
    React.createElement(
      "View",
      { testID: "group-event-detail-overflow" },
      ...actions.map((action) =>
        React.createElement(
          "Button",
          { key: action.testID, onPress: action.onPress, testID: action.testID },
          action.label,
        ),
      ),
    ),
  DetailScaffold: ({
    children,
    headerRight,
    isLoading,
    loadingLabel,
    notFound,
    notFoundDescription,
    notFoundTitle,
    screenTestID,
  }: DetailScaffoldProps) => {
    if (isLoading) return React.createElement("Text", null, loadingLabel);
    if (notFound) {
      return React.createElement(
        "View",
        { testID: "group-event-detail-unavailable" },
        React.createElement("Text", null, notFoundTitle),
        React.createElement("Text", null, notFoundDescription),
      );
    }

    return React.createElement(
      "View",
      { testID: screenTestID },
      typeof headerRight === "function" ? headerRight() : null,
      children,
    );
  },
}));

jest.mock("@/components/groups", () => {
  const actual = jest.requireActual("@/components/groups/GroupEventDetail");

  return {
    __esModule: true,
    GroupEventDetailScreen: actual.GroupEventDetailScreen,
  };
});

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    activityPlans: {
      getManyByIds: {
        useQuery: () => ({ data: { items: [] }, isLoading: false }),
      },
    },
  },
}));

jest.mock("@/lib/server-config", () => ({
  __esModule: true,
  getReachableSupabaseStorageUrl: (url: string | null | undefined) => url ?? null,
}));

jest.mock("@/lib/groups", () => ({
  __esModule: true,
  useGroupDetailViewModel: () => groupVm,
  useGroupEventActions: () => ({
    cancelEvent: cancelEventMock,
    cancelMutation: { isPending: false },
    rsvp: rsvpMock,
    rsvpEventSeries: rsvpEventSeriesMock,
    rsvpEventSeriesMutation: { isPending: false },
    rsvpMutation: { isPending: false },
  }),
  useGroupEventDetailViewModel: () => detailVm,
}));

const GroupEventDetailRoute = require("../group-event-detail").default;

describe("group event detail route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    detailVm.event = { ...baseEvent };
    detailVm.error = null;
    detailVm.isError = false;
    detailVm.isLoading = false;
    detailVm.seriesOccurrences = [];
    detailVm.seriesOccurrencesQuery = { isLoading: false };
    groupVm.viewer = { canCreateGroupEvent: false };
  });

  it("does not render protected event details when access is denied", () => {
    detailVm.event = null;
    detailVm.error = new Error("You don't have permission to view this group");
    detailVm.isError = true;

    renderNative(<GroupEventDetailRoute />);

    expect(screen.getByTestId("group-event-detail-unavailable")).toBeTruthy();
    expect(screen.getByText("Unable to load event")).toBeTruthy();
    expect(screen.queryByText("Members Ride")).toBeNull();
    expect(screen.queryByText("Private route details")).toBeNull();
    expect(screen.queryByTestId("group-event-detail-screen")).toBeNull();
  });

  it("uses the series id for series RSVP actions opened from an occurrence", async () => {
    detailVm.event = {
      ...baseEvent,
      id: "44444444-4444-4444-8444-444444444444",
      series_id: "33333333-3333-4333-8333-333333333333",
      occurrence_key: "2026-05-28",
      title: "Occurrence Ride",
      is_recurring_occurrence: true,
      viewerSeriesRsvp: null,
    };
    detailVm.seriesOccurrences = [
      {
        ...baseEvent,
        id: "55555555-5555-4555-8555-555555555555",
        title: "Next Occurrence",
        series_id: "33333333-3333-4333-8333-333333333333",
        occurrence_key: "2026-06-04",
        is_recurring_occurrence: true,
      },
    ];

    renderNative(<GroupEventDetailRoute />);

    expect(screen.getByText("Repeating event")).toBeTruthy();
    expect(screen.queryByText("Next Occurrence")).toBeNull();

    fireEvent.press(screen.getByText("Apply to series"));
    fireEvent.press(screen.getByText("Going to series"));

    await waitFor(() => {
      expect(rsvpEventSeriesMock).toHaveBeenCalledWith({
        groupEventSeriesId: "33333333-3333-4333-8333-333333333333",
        status: "accepted",
      });
    });
    expect(refetchMock).toHaveBeenCalled();
  });

  it("shows the owning group avatar row and links to the group detail page", () => {
    detailVm.event = {
      ...baseEvent,
      group: {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Ride Club",
        slug: "ride-club",
        avatar_url: null,
      },
    };

    renderNative(<GroupEventDetailRoute />);

    expect(screen.getByText("Ride Club")).toBeTruthy();
    expect(screen.getByText("RC")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Open group Ride Club"));

    expect(pushMock).toHaveBeenCalledWith({
      pathname: "/group-detail",
      params: { groupId: "22222222-2222-4222-8222-222222222222" },
    });
  });

  it("does not expose removed copy-series-plans management for occurrences", () => {
    detailVm.event = {
      ...baseEvent,
      id: "44444444-4444-4444-8444-444444444444",
      series_id: "33333333-3333-4333-8333-333333333333",
      occurrence_key: "2026-05-28",
      is_recurring_occurrence: true,
    };
    groupVm.viewer = { canCreateGroupEvent: true };

    renderNative(<GroupEventDetailRoute />);

    expect(screen.queryByTestId("group-event-detail-copy-series-plans")).toBeNull();
  });
});
