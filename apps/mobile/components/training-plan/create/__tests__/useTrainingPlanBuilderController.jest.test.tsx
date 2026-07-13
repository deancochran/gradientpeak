import { act, renderHook } from "@testing-library/react-native";
import { useTrainingPlanBuilderController } from "../useTrainingPlanBuilderController";

const mockBuilder = {
  actions: {
    addProposedStructure: jest.fn(),
    addSession: jest.fn(),
    assignActivityPlan: jest.fn(),
    getSessionById: jest.fn(() => null),
    removeSession: jest.fn(),
  },
  activityPlanEstimateById: new Map(),
  activityPlanItems: [],
  derived: {
    projection: {
      chart: {
        dailyPoints: [{ date: "2026-01-05" }],
        weeks: [
          {
            weekStart: "2026-01-05",
            weekEnd: "2026-01-11",
            label: "Week 1",
            isSelected: true,
          },
        ],
      },
    },
    savePlan: {
      blockers: [],
      canSave: true,
      execute: jest.fn(),
      isPending: false,
      label: "Create",
    },
    summary: { durationDays: 7, sessionCount: 1 },
  },
  state: { scheduling: { startDate: "2026-01-05" } },
};

jest.mock("expo-router", () => ({ useRouter: () => ({ replace: jest.fn() }) }));
jest.mock("@/lib/hooks/useDebouncedValue", () => ({ useDebouncedValue: (value: string) => value }));
jest.mock("@/components/training-plan/create/useBuilderSheetStack", () => ({
  useBuilderSheetStack: () => ({ closeSheet: jest.fn(), openSheet: jest.fn() }),
}));
jest.mock("@/lib/training-plan-creation/useTrainingPlanCreationService", () => ({
  useTrainingPlanCreationService: () => mockBuilder,
}));

describe("useTrainingPlanBuilderController chart selection", () => {
  it("keeps an immediately selected in-week date even when daily data is temporarily sparse", () => {
    const { result } = renderHook(() => useTrainingPlanBuilderController({ mode: "create" }));

    act(() => result.current.chartReview.selectDate("2026-01-06"));

    expect(result.current.chartReview.selectedDate).toBe("2026-01-06");
    expect(result.current.chartReview.selectedWeekStart).toBe("2026-01-05");
  });

  it("does not add weekly-only data when asked to extend the daily chart", () => {
    const { result } = renderHook(() => useTrainingPlanBuilderController({ mode: "create" }));

    act(() => result.current.chartReview.extendEnd());

    expect(result.current.chartReview.chart.weeks).toHaveLength(1);
    expect(result.current.chartReview.chart.dailyPoints).toHaveLength(1);
  });
});
