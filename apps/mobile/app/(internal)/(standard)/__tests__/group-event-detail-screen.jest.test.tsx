import React from "react";

import { createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";

const pushMock = jest.fn();
const alertMock = jest.fn();
const localSearchParamsMock = { groupEventId: "33333333-3333-4333-8333-333333333333" };
const refetchMock = jest.fn(async () => undefined);
const rsvpEventSeriesMock = jest.fn(async () => undefined);
const copySeriesActivityPlansToOccurrenceMock = jest.fn(async () => undefined);
const cancelEventMock = jest.fn(async () => undefined);
const rsvpMock = jest.fn(async () => undefined);

const baseEvent = {
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
  activityPlanOptions: [] as any[],
  viewerRsvp: null,
  viewerSeriesRsvp: null,
};

const detailVm = {
  detailQuery: {},
  event: baseEvent as any,
  error: null as Error | null,
  isError: false,
  isLoading: false,
  refetch: refetchMock,
  seriesOccurrences: [] as any[],
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

jest.mock("@/components/shared/detail", () => ({
  __esModule: true,
  DetailOverflowMenu: ({ actions }: any) =>
    React.createElement(
      "View",
      { testID: "group-event-detail-overflow" },
      ...actions.map((action: any) =>
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
  }: any) => {
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
    copySeriesActivityPlansToOccurrence: copySeriesActivityPlansToOccurrenceMock,
    copySeriesActivityPlansToOccurrenceMutation: { isPending: false },
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
    detailVm.event = { ...baseEvent } as any;
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
    } as any;
    detailVm.seriesOccurrences = [
      {
        ...baseEvent,
        id: "55555555-5555-4555-8555-555555555555",
        title: "Next Occurrence",
        series_id: "33333333-3333-4333-8333-333333333333",
        occurrence_key: "2026-06-04",
        is_recurring_occurrence: true,
      },
    ] as any[];

    renderNative(<GroupEventDetailRoute />);

    expect(screen.getByText("Series occurrence")).toBeTruthy();
    expect(screen.getByText("Next Occurrence")).toBeTruthy();

    fireEvent.press(screen.getByText("Going to series"));

    await waitFor(() => {
      expect(rsvpEventSeriesMock).toHaveBeenCalledWith({
        groupEventSeriesId: "33333333-3333-4333-8333-333333333333",
        status: "accepted",
      });
    });
    expect(refetchMock).toHaveBeenCalled();
  });

  it("exposes copy-series-plans management only for manageable occurrences", async () => {
    detailVm.event = {
      ...baseEvent,
      id: "44444444-4444-4444-8444-444444444444",
      series_id: "33333333-3333-4333-8333-333333333333",
      occurrence_key: "2026-05-28",
      is_recurring_occurrence: true,
    } as any;
    groupVm.viewer = { canCreateGroupEvent: true };

    renderNative(<GroupEventDetailRoute />);

    fireEvent.press(screen.getByTestId("group-event-detail-copy-series-plans"));

    await waitFor(() => {
      expect(copySeriesActivityPlansToOccurrenceMock).toHaveBeenCalledWith({
        groupEventOccurrenceId: "44444444-4444-4444-8444-444444444444",
        groupEventSeriesId: "33333333-3333-4333-8333-333333333333",
      });
    });
    expect(refetchMock).toHaveBeenCalled();
  });
});
