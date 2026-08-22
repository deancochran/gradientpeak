import { act } from "@testing-library/react-native";
import React from "react";
import { createHost, createPressableHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";

const replaceMock = jest.fn();
const updateEventMock = jest.fn();
const cancelEventMock = jest.fn(async () => undefined);
const rsvpMock = jest.fn(async () => undefined);
const refetchMock = jest.fn(async () => undefined);
const alertMock = jest.fn();
let overflowActions: Array<{
  label: string;
  onPress?: () => void;
  testID: string;
  variant?: string;
}> = [];

const event = {
  id: "99999999-9999-4999-8999-999999999999",
  group_id: "22222222-2222-4222-8222-222222222222",
  series_id: null,
  occurrence_key: null,
  created_by_profile_id: "11111111-1111-4111-8111-111111111111",
  title: "Members Ride",
  description: "Private route details",
  starts_at: "2026-05-21T12:00:00.000Z",
  ends_at: "2026-05-21T14:00:00.000Z",
  timezone: "America/New_York",
  recurrence_rule: null,
  recurrence_timezone: null,
  location_name: "Clubhouse",
  route_id: null,
  group: null,
  cancelled_at: null,
  created_at: "2026-05-21T12:00:00.000Z",
  updated_at: "2026-05-21T12:00:00.000Z",
  is_recurring_series: false,
  is_recurring_occurrence: false,
  activityPlanOptions: [],
  viewerRsvp: null,
  viewerSeriesRsvp: null,
};

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Alert: { alert: alertMock },
  View: createHost("View"),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: {
    Screen: ({ options }: { options?: { headerRight?: () => React.ReactNode } }) =>
      options?.headerRight?.() ?? null,
  },
  useLocalSearchParams: () => ({ groupEventId: event.id }),
  useRouter: () => ({ replace: replaceMock, push: jest.fn() }),
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: createPressableHost("Button"),
}));
jest.mock("@repo/ui/components/loading", () => ({ LoadingButton: createPressableHost("Button") }));
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
  AppFormModal: ({ children }: React.PropsWithChildren) =>
    React.createElement("View", null, children),
}));
jest.mock("@/components/shared/detail", () => ({
  __esModule: true,
  DetailOverflowMenu: ({
    actions,
  }: {
    actions: Array<{ label: string; onPress?: () => void; testID: string; variant?: string }>;
  }) => {
    overflowActions = actions;
    const MenuButton = createPressableHost("Button");
    return React.createElement(
      "View",
      null,
      ...actions.map((action) =>
        React.createElement(
          MenuButton,
          { key: action.testID, onPress: action.onPress, testID: action.testID },
          action.label,
        ),
      ),
    );
  },
  DetailScaffold: ({
    children,
    headerRight,
  }: React.PropsWithChildren<{ headerRight?: () => React.ReactNode }>) =>
    React.createElement("View", null, headerRight?.(), children),
}));
jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    activityPlans: {
      getManyByIds: { useQuery: () => ({ data: { items: [] }, isLoading: false }) },
    },
  },
}));
jest.mock("@/lib/server-config", () => ({
  __esModule: true,
  getReachableSupabaseStorageUrl: (url: string | null | undefined) => url ?? null,
}));
jest.mock("@/components/groups", () => {
  const actualDetail = jest.requireActual("@/components/groups/GroupEventDetail");
  return {
    __esModule: true,
    GroupEventDetailScreen: actualDetail.GroupEventDetailScreen,
    GroupEventForm: React.forwardRef(function MockGroupEventForm(
      props: { onSubmit: (values: { title: string; startsAt: string }) => void },
      ref: React.ForwardedRef<{ submit: () => void }>,
    ) {
      React.useImperativeHandle(ref, () => ({
        submit: () =>
          props.onSubmit({ title: "Updated ride", startsAt: "2026-05-28T12:00:00.000Z" }),
      }));
      return React.createElement(
        "Button",
        {
          testID: "group-event-form-submit",
          onPress: () =>
            props.onSubmit({ title: "Updated ride", startsAt: "2026-05-28T12:00:00.000Z" }),
        },
        "Submit form",
      );
    }),
    GroupListSkeleton: createHost("GroupListSkeleton"),
  };
});
jest.mock("@/lib/groups", () => ({
  __esModule: true,
  useGroupDetailViewModel: () => ({ viewer: { canCreateGroupEvent: true } }),
  useGroupEventDetailViewModel: () => ({
    event,
    isError: false,
    isLoading: false,
    refetch: refetchMock,
    seriesOccurrences: [],
    seriesOccurrencesQuery: {
      error: null,
      isError: false,
      isFetching: false,
      isLoading: false,
      refetch: refetchMock,
    },
  }),
  useGroupEventActions: () => ({
    cancelEvent: cancelEventMock,
    cancelMutation: { isPending: false },
    updateEvent: updateEventMock,
    updateMutation: { isPending: false },
    updateEventOccurrenceMutation: { isPending: false },
    rsvp: rsvpMock,
    rsvpMutation: { isPending: false },
    rsvpEventSeries: jest.fn(),
    rsvpEventSeriesMutation: { isPending: false },
  }),
}));

const GroupEventEditRoute = require("../group-event-edit").default;
const GroupEventDetailRoute = require("../group-event-detail").default;

describe("P2 group event capabilities", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    overflowActions = [];
  });

  it("group-event.edit saves a one-off event from the screen header", async () => {
    renderNative(<GroupEventEditRoute />);

    await act(async () => {
      fireEvent.press(screen.getByText("Save"));
    });

    await waitFor(() =>
      expect(updateEventMock).toHaveBeenCalledWith({
        groupEventId: event.id,
        title: "Updated ride",
        startsAt: "2026-05-28T12:00:00.000Z",
      }),
    );
  });

  it("group-event.delete cancels an event through the management menu", async () => {
    renderNative(<GroupEventDetailRoute />);

    expect(overflowActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Cancel event",
          testID: "group-event-detail-cancel",
          variant: "destructive",
        }),
      ]),
    );
  });

  it("group-event.rsvp sends the selected status from the real event detail control", async () => {
    renderNative(<GroupEventDetailRoute />);

    fireEvent.press(screen.getByText("Going"));

    await waitFor(() => expect(rsvpMock).toHaveBeenCalledWith(event.id, "going"));
  });
});
