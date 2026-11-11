import { createHost } from "../../../../test/mock-components";
import { renderNative, screen } from "../../../../test/render-native";

const ledgerQuery = jest.fn();
const calendarRangeQuery = jest.fn();
let params: { anchorDate?: string; period?: string } = {
  anchorDate: "2026-04-15",
  period: "day",
};

jest.mock("react-native", () => ({
  ...jest.requireActual("@repo/ui/test/react-native"),
  ScrollView: createHost("ScrollView"),
  View: createHost("View"),
}));
jest.mock("expo-router", () => ({
  Stack: { Screen: createHost("StackScreen") },
  useLocalSearchParams: () => params,
  useRouter: () => ({ navigate: jest.fn() }),
}));
jest.mock("@/components/plan/ledger/PlanningLedgerView", () => ({
  PlanningLedgerView: createHost("PlanningLedgerView"),
}));
jest.mock("@/components/shared/ScreenState", () => ({
  ErrorState: createHost("ErrorState"),
  LoadingState: createHost("LoadingState"),
}));
jest.mock("@/lib/api", () => ({
  api: {
    calendar: {
      range: { useQuery: (...args: unknown[]) => calendarRangeQuery(...args) },
    },
    trainingPlans: {
      getPlanningLedger: { useQuery: (...args: unknown[]) => ledgerQuery(...args) },
    },
  },
}));

const PlanningLedgerScreen = require("../planning-ledger").default;

beforeEach(() => {
  jest.clearAllMocks();
  params = { anchorDate: "2026-04-15", period: "day" };
  ledgerQuery.mockReturnValue({
    data: {
      period: "day",
      periodStart: "2026-04-15",
      periodEnd: "2026-04-15",
      trainingComposition: { id: "training-composition" },
    },
    isError: false,
    isLoading: false,
  });
  calendarRangeQuery.mockReturnValue({
    data: { items: [{ activity: { id: "activity-1" } }] },
    isError: false,
    isLoading: false,
    refetch: jest.fn(),
  });
});

it.each(["day", "week"] as const)("loads the canonical %s Training Breakdown", async (period) => {
  params = { anchorDate: "2026-04-15", period };
  await renderNative(<PlanningLedgerScreen />);

  expect(ledgerQuery).toHaveBeenCalledWith({ anchorDate: "2026-04-15", period }, { enabled: true });
  expect(calendarRangeQuery).toHaveBeenCalledWith(
    { startDate: "2026-04-15", endDateExclusive: "2026-04-16", limit: 500 },
    { enabled: true },
  );
  expect(screen.getByTestId("planning-ledger-screen")).toBeTruthy();
  const stackScreen = screen.container.queryAll((node) => node.type === "StackScreen")[0];
  if (!stackScreen) throw new Error("Expected Stack screen");
  expect(stackScreen.props.options.title).toBe("Training Breakdown");
  expect(screen.container.queryAll((node) => node.type === "PlanningLedgerView")).toHaveLength(1);
  expect(
    screen.container.queryAll((node) => node.type === "PlanningLedgerView")[0]?.props
      .completedActivities,
  ).toEqual([{ id: "activity-1" }]);
  expect(
    screen.container.queryAll((node) => node.type === "PlanningLedgerView")[0]?.props
      .trainingComposition,
  ).toEqual({ id: "training-composition" });
});

it("rejects the removed month surface", async () => {
  params = { anchorDate: "2026-04-15", period: "month" };
  await renderNative(<PlanningLedgerScreen />);

  expect(ledgerQuery).toHaveBeenCalledWith(
    { anchorDate: "1970-01-01", period: "day" },
    { enabled: false },
  );
  const errorState = screen.container.queryAll((node) => node.type === "ErrorState")[0];
  if (!errorState) throw new Error("Expected error state");
  expect(errorState.props.description).toContain("day or week");
});

it("renders authoritative ledger data while activity-card hydration fails", async () => {
  calendarRangeQuery.mockReturnValue({
    data: undefined,
    isError: true,
    isLoading: false,
    refetch: jest.fn(),
  });

  await renderNative(<PlanningLedgerScreen />);

  expect(screen.container.queryAll((node) => node.type === "PlanningLedgerView")).toHaveLength(1);
  expect(screen.container.queryAll((node) => node.type === "ErrorState")).toHaveLength(0);
});
