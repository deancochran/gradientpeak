import { createHost, createStackComponent } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const navigateMock = jest.fn();
let params: { anchorDate?: string; period?: string } = {
  anchorDate: "2026-04-15",
  period: "week",
};
let queryState: "data" | "loading" | "error" | "empty" = "data";
let partialCoverage = false;
const refetchMock = jest.fn();

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: createStackComponent(),
  useLocalSearchParams: () => params,
  useRouter: () => ({ navigate: navigateMock }),
}));

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  ScrollView: createHost("ScrollView"),
  TouchableOpacity: createHost("TouchableOpacity"),
  View: createHost("View"),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: createHost("Button"),
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  ChevronDown: createHost("ChevronDown"),
  ChevronRight: createHost("ChevronRight"),
  Inbox: createHost("Inbox"),
  RefreshCw: createHost("RefreshCw"),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    trainingPlans: {
      getPlanningLedger: {
        useQuery: () => ({
          data:
            queryState === "data"
              ? {
                  contractVersion: "planning-ledger-v3",
                  period: "week",
                  anchorDate: "2026-04-15",
                  periodStart: "2026-04-13",
                  periodEnd: "2026-04-19",
                  planningTimezone: "America/Los_Angeles",
                  asOf: "2026-04-15T12:00:00.000Z",
                  load: Object.fromEntries(
                    ["completed", "planned", "remaining", "effective"].map((key) => [
                      key,
                      { status: "complete", value: 20 },
                    ]),
                  ),
                  intensity: { status: "partial", value: 0.7 },
                  contributingDurationSeconds: { status: "complete", value: 3600 },
                  trainingState: {
                    actual: Object.fromEntries(
                      ["fitness", "fatigue"].map((key) => [
                        key,
                        {
                          status: "available",
                          value: 42,
                          observedOn: "2026-04-15",
                          source: "actual",
                        },
                      ]),
                    ),
                    planned: Object.fromEntries(
                      ["fitness", "fatigue"].map((key) => [
                        key,
                        {
                          status: "available",
                          value: 44,
                          observedOn: "2026-04-16",
                          source: "scheduled_projection",
                        },
                      ]),
                    ),
                  },
                  dailyBreakdown: [],
                  entries: [
                    {
                      id: "event-ordinary",
                      date: "2026-04-15",
                      startsAt: "2026-04-15T18:00:00.000Z",
                      kind: "event",
                      title: "Physio appointment",
                      status: "scheduled",
                      load: { status: "unavailable", value: null },
                      intensity: { status: "unavailable", value: null },
                      contributingDurationSeconds: { status: "unavailable", value: null },
                      navigation: { target: "event", id: "event-ordinary" },
                    },
                    {
                      id: "group-event-1",
                      date: "2026-04-15",
                      startsAt: "2026-04-15T20:00:00.000Z",
                      kind: "group_event",
                      title: "Club ride",
                      status: "scheduled",
                      load: { status: "unavailable", value: null },
                      intensity: { status: "unavailable", value: null },
                      contributingDurationSeconds: { status: "unavailable", value: null },
                      navigation: { target: "group_event", id: "group-event-1" },
                    },
                  ],
                  entriesTruncated: false,
                  milestones: [],
                  sourceCoverage: {
                    activities: {
                      startDate: "2026-04-13",
                      endDate: "2026-04-19",
                      status: "complete",
                    },
                    scheduledItems: {
                      startDate: "2026-04-13",
                      endDate: "2026-04-19",
                      status: "complete",
                    },
                    calendarEvents: {
                      startDate: "2026-04-13",
                      endDate: "2026-04-19",
                      status: partialCoverage ? "partial" : "complete",
                    },
                    groupEvents: {
                      startDate: "2026-04-13",
                      endDate: "2026-04-19",
                      status: "complete",
                    },
                  },
                  modelContext: {
                    commonLoadModel: "gradientpeak_relative_load",
                    commonLoadVersion: "1",
                    publishedRevision: 7,
                    algorithmVersion: "athlete-state-v1",
                  },
                }
              : undefined,
          isLoading: queryState === "loading",
          isError: queryState === "error",
          refetch: refetchMock,
        }),
      },
    },
  },
}));

const PlanningLedgerScreen = require("../planning-ledger").default;

describe("PlanningLedgerScreen", () => {
  beforeEach(() => {
    params = { anchorDate: "2026-04-15", period: "week" };
    queryState = "data";
    partialCoverage = false;
    refetchMock.mockClear();
  });

  it("renders factual ledger sections for a valid period", () => {
    renderNative(<PlanningLedgerScreen />);

    expect(screen.getByTestId("planning-ledger-load")).toBeTruthy();
    expect(screen.getByTestId("planning-ledger-training-state")).toBeTruthy();
    expect(screen.getByTestId("planning-ledger-daily-breakdown")).toBeTruthy();
    expect(
      screen.getByTestId("planning-ledger-data-details-trigger").props.accessibilityState,
    ).toEqual({ expanded: false });
    fireEvent.press(screen.getByTestId("planning-ledger-data-details-trigger"));
    expect(screen.getByTestId("planning-ledger-source-coverage")).toBeTruthy();
    expect(screen.getByTestId("planning-ledger-model-context")).toBeTruthy();
    expect(screen.getByText("Physio appointment")).toBeTruthy();
    expect(screen.getByText("Club ride")).toBeTruthy();
    expect(screen.getByText("Planned")).toBeTruthy();
    expect(screen.getByText("Intensity")).toBeTruthy();
    expect(screen.getByText("Partial")).toBeTruthy();
    expect(screen.getByText("Actual fitness")).toBeTruthy();
    expect(screen.getByText("Planned fatigue projection")).toBeTruthy();
    expect(screen.getByText(/Calendar events: complete/)).toBeTruthy();
    expect(screen.getByText(/Group events: complete/)).toBeTruthy();
    expect(screen.queryByText("Tentative")).toBeNull();
    expect(screen.queryByText(/suggest|adjust|apply/i)).toBeNull();
    expect(
      screen.getByTestId("planning-ledger-load").findByProps({ accessibilityRole: "header" }),
    ).toBeTruthy();
  });

  it("navigates calendar and group entries to existing detail screens", () => {
    renderNative(<PlanningLedgerScreen />);

    screen.getByTestId("planning-ledger-entry-event-event-ordinary").props.onPress();
    screen.getByTestId("planning-ledger-entry-group_event-group-event-1").props.onPress();

    expect(navigateMock).toHaveBeenCalledWith({
      pathname: "/event-detail",
      params: { id: "event-ordinary" },
    });
    expect(
      screen.getByTestId("planning-ledger-entry-event-event-ordinary").props.accessibilityLabel,
    ).toBe("Open Physio appointment event details");
    expect(navigateMock).toHaveBeenCalledWith({
      pathname: "/group-event-detail",
      params: { groupEventId: "group-event-1" },
    });
  });

  it("auto-expands and visibly flags partial coverage", () => {
    partialCoverage = true;
    renderNative(<PlanningLedgerScreen />);
    expect(screen.getByText("Partial source coverage")).toBeTruthy();
    expect(
      screen.getByTestId("planning-ledger-data-details-trigger").props.accessibilityState,
    ).toEqual({ expanded: true });
  });

  it("auto-opens on degradation once without reopening an unchanged flag", () => {
    partialCoverage = false;
    const rendered = renderNative(<PlanningLedgerScreen />);
    expect(screen.queryByTestId("planning-ledger-data-details")).toBeNull();

    partialCoverage = true;
    rendered.rerender(<PlanningLedgerScreen />);
    expect(screen.getByTestId("planning-ledger-data-details")).toBeTruthy();
    fireEvent.press(screen.getByTestId("planning-ledger-data-details-trigger"));
    expect(screen.queryByTestId("planning-ledger-data-details")).toBeNull();

    rendered.rerender(<PlanningLedgerScreen />);
    expect(screen.queryByTestId("planning-ledger-data-details")).toBeNull();
  });

  it("rejects missing route data without issuing a ledger view", () => {
    params = {};
    renderNative(<PlanningLedgerScreen />);

    expect(screen.getByText("Planning period is invalid")).toBeTruthy();
    expect(screen.queryByTestId("planning-ledger-content")).toBeNull();
  });

  it.each([
    ["loading", "planning-ledger-loading"],
    ["error", "Planning ledger could not be loaded"],
    ["empty", "Planning ledger is unavailable"],
  ] as const)("renders the %s route state", (state, expected) => {
    queryState = state;
    renderNative(<PlanningLedgerScreen />);
    if (state === "loading") expect(screen.getByTestId(expected)).toBeTruthy();
    else expect(screen.getByText(expected)).toBeTruthy();
  });

  it("retries a failed ledger query", () => {
    queryState = "error";
    renderNative(<PlanningLedgerScreen />);
    fireEvent.press(screen.getByText("Try again"));
    expect(refetchMock).toHaveBeenCalledTimes(1);
  });
});
