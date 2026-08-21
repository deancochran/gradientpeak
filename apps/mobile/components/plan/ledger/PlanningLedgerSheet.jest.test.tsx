import type { ReactNode } from "react";
import { createHost } from "../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../test/render-native";

const ledgerQueryMock = jest.fn();
const refetchMock = jest.fn(async () => undefined);
const openEntryMock = jest.fn();
const ledgerFixture = {
  contractVersion: "planning-ledger-v3",
  period: "week",
  anchorDate: "2026-04-13",
  periodStart: "2026-04-13",
  periodEnd: "2026-04-19",
  planningTimezone: "America/Los_Angeles",
  asOf: "2026-04-13T12:00:00.000Z",
  load: {
    completed: { status: "complete", value: 20 },
    planned: { status: "known_zero", value: 0 },
    remaining: { status: "partial", value: 10 },
    effective: { status: "complete", value: 50 },
  },
  intensity: { status: "complete", value: 0.7 },
  contributingDurationSeconds: { status: "complete", value: 3600 },
  trainingState: {
    actual: {
      fitness: { status: "available", value: 42, observedOn: "2026-04-13", source: "actual" },
      fatigue: { status: "available", value: 30, observedOn: "2026-04-13", source: "actual" },
    },
    planned: {
      fitness: {
        status: "available",
        value: 44,
        observedOn: "2026-04-19",
        source: "scheduled_projection",
      },
      fatigue: {
        status: "available",
        value: 32,
        observedOn: "2026-04-19",
        source: "scheduled_projection",
      },
    },
  },
  dailyBreakdown: [],
  entries: [
    {
      id: "event-1",
      date: "2026-04-13",
      startsAt: "2026-04-13T18:00:00.000Z",
      kind: "event",
      title: "Track session",
      status: "scheduled",
      load: { status: "unavailable", value: null },
      intensity: { status: "unavailable", value: null },
      contributingDurationSeconds: { status: "unavailable", value: null },
      navigation: { target: "event", id: "event-1" },
    },
  ],
  entriesTruncated: false,
  milestones: [],
  sourceCoverage: {
    activities: { startDate: "2026-04-13", endDate: "2026-04-19", status: "complete" },
    scheduledItems: { startDate: "2026-04-13", endDate: "2026-04-19", status: "complete" },
    calendarEvents: { startDate: "2026-04-13", endDate: "2026-04-19", status: "partial" },
    groupEvents: { startDate: "2026-04-13", endDate: "2026-04-19", status: "complete" },
  },
  modelContext: {
    commonLoadModel: "gradientpeak_relative_load",
    commonLoadVersion: "1",
    publishedRevision: 7,
    algorithmVersion: "athlete-state-v1",
  },
};

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  ActivityIndicator: createHost("ActivityIndicator"),
  TouchableOpacity: createHost("TouchableOpacity"),
  View: createHost("View"),
}));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));
jest.mock("lucide-react-native", () => ({
  __esModule: true,
  ChevronDown: createHost("ChevronDown"),
  ChevronRight: createHost("ChevronRight"),
}));
jest.mock("@/components/shared/PointInTimeDetailsSheet", () => ({
  __esModule: true,
  PointInTimeDetailsSheet: ({
    children,
    visible,
    ...props
  }: {
    children: ReactNode;
    visible: boolean;
  }) => (visible ? createHost("PointInTimeDetailsSheet")({ ...props, children }) : null),
}));
jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    trainingPlans: {
      getPlanningLedger: {
        useQuery: (input: unknown, options: unknown) => ledgerQueryMock(input, options),
      },
    },
  },
}));

const PlanningLedgerSheet = require("./PlanningLedgerSheet").PlanningLedgerSheet;
const selection = { anchorDate: "2026-04-13", period: "week" as const };

describe("PlanningLedgerSheet", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ledgerQueryMock.mockReturnValue({
      data: undefined,
      isError: false,
      isLoading: false,
      refetch: refetchMock,
    });
  });

  it("does not request or display details without a selection", () => {
    renderNative(
      <PlanningLedgerSheet onClose={jest.fn()} onOpenEntry={openEntryMock} selection={null} />,
    );

    expect(ledgerQueryMock).toHaveBeenCalledWith(
      { anchorDate: "1970-01-01", period: "week" },
      { enabled: false },
    );
    expect(screen.queryByTestId("planning-ledger-sheet")).toBeNull();
  });

  it("loads the selected period into the standard point-in-time sheet", () => {
    ledgerQueryMock.mockReturnValue({
      data: ledgerFixture,
      isError: false,
      isLoading: false,
      refetch: refetchMock,
    });
    renderNative(
      <PlanningLedgerSheet onClose={jest.fn()} onOpenEntry={openEntryMock} selection={selection} />,
    );

    expect(ledgerQueryMock).toHaveBeenCalledWith(selection, { enabled: true });
    expect(screen.getByTestId("planning-ledger-sheet").props.title).toBe("Week details");
    expect(screen.getByTestId("planning-ledger-sheet-data-warning")).toBeTruthy();
    expect(screen.getByLabelText("Planned: 0")).toBeTruthy();
    expect(screen.getByLabelText("Remaining: 10. Partial")).toBeTruthy();
    fireEvent.press(screen.getByTestId("planning-ledger-entry-event-event-1"));
    expect(openEntryMock).toHaveBeenCalledWith({ id: "event-1", target: "event" });
  });

  it("announces a load failure and retries", () => {
    ledgerQueryMock.mockReturnValue({
      data: undefined,
      isError: true,
      isLoading: false,
      refetch: refetchMock,
    });
    renderNative(
      <PlanningLedgerSheet onClose={jest.fn()} onOpenEntry={openEntryMock} selection={selection} />,
    );

    expect(screen.getByTestId("planning-ledger-sheet-error").props.accessibilityRole).toBe("alert");
    fireEvent.press(screen.getByTestId("planning-ledger-sheet-retry"));
    expect(refetchMock).toHaveBeenCalledTimes(1);
  });
});
