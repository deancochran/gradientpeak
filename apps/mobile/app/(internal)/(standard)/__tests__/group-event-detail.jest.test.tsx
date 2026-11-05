import React from "react";
import { createHost as mockCreateHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";
import GroupEventDetailRoute from "../group-event-detail";

const routerPushMock = jest.fn();
const detailRefetchMock = jest.fn(async () => undefined);
const cancelEventMock = jest.fn(async () => ({}));
const rsvpMock = jest.fn(async () => ({}));
const rsvpEventSeriesMock = jest.fn(async () => ({}));
const mockAlert = jest.fn();
const useGroupEventDetailViewModelMock = jest.fn();
const useGroupDetailViewModelMock = jest.fn();
let overflowActions: Array<{ onPress?: () => void; testID: string }> = [];

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
type GroupEventDetailProps = {
  event: { title: string };
  onOccurrencePress: (event: { id: string }) => void;
  onRsvp: (status: string, eventId: string) => void;
  onRsvpSeries: (status: string) => void;
};

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
  };
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
  DetailOverflowMenu: ({ actions, testID }: { actions: OverflowAction[]; testID?: string }) => {
    overflowActions = actions;
    return React.createElement(
      "View",
      { testID },
      ...actions.map((action) =>
        React.createElement(
          "Button",
          { key: action.testID, onPress: action.onPress, testID: action.testID },
          React.createElement("Text", null, action.label),
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
  }: DetailScaffoldProps) => {
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
  GroupEventDetailScreen: ({
    event,
    onOccurrencePress,
    onRsvp,
    onRsvpSeries,
  }: GroupEventDetailProps) =>
    React.createElement(
      "View",
      { testID: "mock-group-event-detail-screen" },
      React.createElement("Text", null, event.title),
      React.createElement(
        "Button",
        {
          onPress: () => onRsvp("going", "44444444-4444-4444-8444-444444444444"),
          testID: "mock-rsvp-occurrence",
        },
        React.createElement("Text", null, "Going"),
      ),
      React.createElement(
        "Button",
        { onPress: () => onRsvpSeries("going"), testID: "mock-rsvp-series" },
        React.createElement("Text", null, "Going to series"),
      ),
      React.createElement(
        "Button",
        {
          onPress: () => onOccurrencePress({ id: "77777777-7777-4777-8777-777777777777" }),
          testID: "mock-open-occurrence",
        },
        React.createElement("Text", null, "Future occurrence"),
      ),
    ),
}));

jest.mock("@/lib/groups", () => ({
  __esModule: true,
  useGroupDetailViewModel: (...args: unknown[]) => useGroupDetailViewModelMock(...args),
  useGroupEventActions: () => ({
    cancelEvent: cancelEventMock,
    rsvp: rsvpMock,
    rsvpEventSeries: rsvpEventSeriesMock,
    cancelMutation: { isPending: false },
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

  it("renders unavailable state without event content when the detail query is denied", async () => {
    useGroupEventDetailViewModelMock.mockReturnValue({
      event: null,
      isError: true,
      isLoading: false,
      refetch: detailRefetchMock,
      seriesOccurrences: [],
      seriesOccurrencesQuery: { isLoading: false },
    });
    useGroupDetailViewModelMock.mockReturnValue({ viewer: null });

    await renderNative(<GroupEventDetailRoute />);

    expect(screen.getByText("Unable to load event")).toBeTruthy();
    expect(screen.getByText("This group event may be unavailable.")).toBeTruthy();
    expect(screen.queryByText("Members Only Ride")).toBeNull();
    expect(screen.queryByTestId("group-event-detail-overflow")).toBeNull();
  });

  it("keeps management actions hidden from viewers without create-event permission", async () => {
    useGroupDetailViewModelMock.mockReturnValue({ viewer: { canCreateGroupEvent: false } });

    await renderNative(<GroupEventDetailRoute />);

    expect(screen.getByText("Members Only Ride")).toBeTruthy();
    expect(screen.queryByTestId("group-event-detail-overflow")).toBeNull();
    expect(screen.queryByTestId("group-event-detail-edit")).toBeNull();
    expect(screen.queryByTestId("group-event-detail-cancel")).toBeNull();
  });

  it("does not expose removed copy-series-plans management for occurrences", async () => {
    await renderNative(<GroupEventDetailRoute />);

    expect(screen.queryByTestId("group-event-detail-copy-series-plans")).toBeNull();
  });

  it("offers occurrence editing without exposing series editing", async () => {
    await renderNative(<GroupEventDetailRoute />);

    await fireEvent.press(screen.getByTestId("group-event-detail-edit"));
    expect(routerPushMock).toHaveBeenCalledWith({
      pathname: "/group-event-edit",
      params: { groupEventId: "99999999-9999-4999-8999-999999999999" },
    });

    expect(screen.queryByTestId("group-event-detail-edit-series")).toBeNull();
  });

  it("exposes cancel from the management menu for recurring occurrences", async () => {
    await renderNative(<GroupEventDetailRoute />);

    expect(overflowActions.some((action) => action.testID === "group-event-detail-cancel")).toBe(
      true,
    );
  });

  it("sends occurrence and series RSVP mutations to the correct targets", async () => {
    await renderNative(<GroupEventDetailRoute />);

    await fireEvent.press(screen.getByTestId("mock-rsvp-occurrence"));
    await fireEvent.press(screen.getByTestId("mock-rsvp-series"));

    await waitFor(() => {
      expect(rsvpMock).toHaveBeenCalledWith("99999999-9999-4999-8999-999999999999", "going");
      expect(rsvpEventSeriesMock).toHaveBeenCalledWith({
        groupEventSeriesId: "88888888-8888-4888-8888-888888888888",
        status: "going",
      });
    });
  });

  it("opens future occurrences without losing the occurrence id", async () => {
    await renderNative(<GroupEventDetailRoute />);

    await fireEvent.press(screen.getByTestId("mock-open-occurrence"));

    expect(routerPushMock).toHaveBeenCalledWith({
      pathname: "/group-event-detail",
      params: { groupEventId: "77777777-7777-4777-8777-777777777777" },
    });
  });
});
