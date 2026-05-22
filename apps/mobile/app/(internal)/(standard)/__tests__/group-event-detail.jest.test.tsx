import React from "react";
import { createHost as mockCreateHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";
import GroupEventDetailRoute from "../group-event-detail";

const routerPushMock = jest.fn();
const detailRefetchMock = jest.fn(async () => undefined);
const copySeriesActivityPlansToOccurrenceMock = jest.fn(async () => ({}));
const cancelEventMock = jest.fn(async () => ({}));
const rsvpMock = jest.fn(async () => ({}));
const rsvpEventSeriesMock = jest.fn(async () => ({}));
const mockAlert = jest.fn();
const useGroupEventDetailViewModelMock = jest.fn();
const useGroupDetailViewModelMock = jest.fn();
let overflowActions: Array<{ onPress?: () => void; testID: string }> = [];

function createEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "99999999-9999-4999-8999-999999999999",
    group_id: "22222222-2222-4222-8222-222222222222",
    series_id: "88888888-8888-4888-8888-888888888888",
    title: "Members Only Ride",
    is_recurring_series: false,
    is_recurring_occurrence: true,
    cancelled_at: null,
    ...overrides,
  } as any;
}

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Alert: { alert: (...args: unknown[]) => mockAlert(...args) },
  View: mockCreateHost("View"),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  useLocalSearchParams: () => ({ groupEventId: "99999999-9999-4999-8999-999999999999" }),
  useRouter: () => ({ push: routerPushMock }),
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: mockCreateHost("Button"),
}));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: mockCreateHost("Text") }));

jest.mock("@/components/shared/detail", () => ({
  __esModule: true,
  DetailOverflowMenu: ({ actions, testID }: any) => {
    overflowActions = actions;
    return React.createElement(
      "View",
      { testID },
      ...actions.map((action: any) =>
        React.createElement(
          "Button",
          { key: action.testID, onPress: action.onPress, testID: action.testID },
          action.label,
        ),
      ),
    );
  },
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
        { testID: "group-event-detail-not-found" },
        React.createElement("Text", null, notFoundTitle),
        React.createElement("Text", null, notFoundDescription),
      );
    }

    return React.createElement("View", { testID: screenTestID }, headerRight?.(), children);
  },
}));

jest.mock("@/components/groups", () => ({
  __esModule: true,
  GroupEventDetailScreen: ({ event, onOccurrencePress, onRsvp, onRsvpSeries }: any) =>
    React.createElement(
      "View",
      { testID: "mock-group-event-detail-screen" },
      React.createElement("Text", null, event.title),
      React.createElement(
        "Button",
        {
          onPress: () => onRsvp("accepted", "44444444-4444-4444-8444-444444444444"),
          testID: "mock-rsvp-occurrence",
        },
        "Going",
      ),
      React.createElement(
        "Button",
        { onPress: () => onRsvpSeries("accepted"), testID: "mock-rsvp-series" },
        "Going to series",
      ),
      React.createElement(
        "Button",
        {
          onPress: () => onOccurrencePress({ id: "77777777-7777-4777-8777-777777777777" }),
          testID: "mock-open-occurrence",
        },
        "Future occurrence",
      ),
    ),
}));

jest.mock("@/lib/groups", () => ({
  __esModule: true,
  useGroupDetailViewModel: (...args: unknown[]) => useGroupDetailViewModelMock(...args),
  useGroupEventActions: () => ({
    cancelEvent: cancelEventMock,
    copySeriesActivityPlansToOccurrence: copySeriesActivityPlansToOccurrenceMock,
    rsvp: rsvpMock,
    rsvpEventSeries: rsvpEventSeriesMock,
    cancelMutation: { isPending: false },
    copySeriesActivityPlansToOccurrenceMutation: { isPending: false },
    rsvpMutation: { isPending: false },
    rsvpEventSeriesMutation: { isPending: false },
  }),
  useGroupEventDetailViewModel: (...args: unknown[]) => useGroupEventDetailViewModelMock(...args),
}));

describe("group event detail route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    overflowActions = [];
    useGroupEventDetailViewModelMock.mockReturnValue({
      event: createEvent(),
      isError: false,
      isLoading: false,
      refetch: detailRefetchMock,
      seriesOccurrences: [],
      seriesOccurrencesQuery: { isLoading: false },
    });
    useGroupDetailViewModelMock.mockReturnValue({
      viewer: { canCreateGroupEvent: true },
    });
  });

  it("renders unavailable state without event content when the detail query is denied", () => {
    useGroupEventDetailViewModelMock.mockReturnValue({
      event: null,
      isError: true,
      isLoading: false,
      refetch: detailRefetchMock,
      seriesOccurrences: [],
      seriesOccurrencesQuery: { isLoading: false },
    });
    useGroupDetailViewModelMock.mockReturnValue({ viewer: null });

    renderNative(<GroupEventDetailRoute />);

    expect(screen.getByText("Unable to load event")).toBeTruthy();
    expect(screen.getByText("This group event may be unavailable.")).toBeTruthy();
    expect(screen.queryByText("Members Only Ride")).toBeNull();
    expect(screen.queryByTestId("group-event-detail-overflow")).toBeNull();
  });

  it("keeps management actions hidden from viewers without create-event permission", () => {
    useGroupDetailViewModelMock.mockReturnValue({ viewer: { canCreateGroupEvent: false } });

    renderNative(<GroupEventDetailRoute />);

    expect(screen.getByText("Members Only Ride")).toBeTruthy();
    expect(screen.queryByTestId("group-event-detail-overflow")).toBeNull();
    expect(screen.queryByTestId("group-event-detail-edit")).toBeNull();
    expect(screen.queryByTestId("group-event-detail-cancel")).toBeNull();
  });

  it("copies series activity plans into an overridden occurrence", async () => {
    renderNative(<GroupEventDetailRoute />);

    fireEvent.press(screen.getByTestId("group-event-detail-copy-series-plans"));

    await waitFor(() => {
      expect(copySeriesActivityPlansToOccurrenceMock).toHaveBeenCalledWith({
        groupEventOccurrenceId: "99999999-9999-4999-8999-999999999999",
        groupEventSeriesId: "88888888-8888-4888-8888-888888888888",
      });
    });
    expect(detailRefetchMock).toHaveBeenCalled();
  });

  it("exposes cancel from the management menu for recurring occurrences", () => {
    renderNative(<GroupEventDetailRoute />);

    expect(overflowActions.some((action) => action.testID === "group-event-detail-cancel")).toBe(
      true,
    );
  });

  it("sends occurrence and series RSVP mutations to the correct targets", async () => {
    renderNative(<GroupEventDetailRoute />);

    fireEvent.press(screen.getByTestId("mock-rsvp-occurrence"));
    fireEvent.press(screen.getByTestId("mock-rsvp-series"));

    await waitFor(() => {
      expect(rsvpMock).toHaveBeenCalledWith(
        "99999999-9999-4999-8999-999999999999",
        "accepted",
        "44444444-4444-4444-8444-444444444444",
      );
      expect(rsvpEventSeriesMock).toHaveBeenCalledWith({
        groupEventSeriesId: "88888888-8888-4888-8888-888888888888",
        status: "accepted",
      });
    });
  });

  it("opens future occurrences without losing the occurrence id", () => {
    renderNative(<GroupEventDetailRoute />);

    fireEvent.press(screen.getByTestId("mock-open-occurrence"));

    expect(routerPushMock).toHaveBeenCalledWith({
      pathname: "/group-event-detail",
      params: { groupEventId: "77777777-7777-4777-8777-777777777777" },
    });
  });
});
