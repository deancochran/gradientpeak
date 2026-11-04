import { act, renderHook } from "@testing-library/react-native";
import type { useTrainingPlanCreationService } from "@/lib/training-plan-creation/useTrainingPlanCreationService";
import { useCreationChartController } from "../useCreationChartController";

const makeBuilder = () => ({
  state: {
    scheduling: { startDate: "2026-11-04" },
    selection: { type: "overview" },
    structure: { sessions: [] },
  },
  actions: { getSessionById: jest.fn() },
  derived: {
    backendPlanningPreview: {
      data: {
        status: "available",
        sessionResults: [],
        simulation: {
          transitions: [
            {
              sourceId: "plan-day:2026-11-04",
              toAsOf: "2026-11-05T00:00:00Z",
              state: { longTermLoad: 40, recentLoad: 50, loadBalance: -10 },
            },
          ],
        },
      },
      isEnabled: true,
      isFetching: false,
      isStaleInput: false,
      error: null,
    },
  },
});

describe("creation chart selection and current forecast", () => {
  it("keeps the authored range future-facing and allows navigating beyond the last session", async () => {
    const builder = makeBuilder();
    const { result } = await renderHook(() =>
      useCreationChartController(
        builder as unknown as ReturnType<typeof useTrainingPlanCreationService>,
        {},
      ),
    );
    expect(result.current.chartProps.dailyPoints).toHaveLength(42);
    expect(result.current.chartProps.dailyPoints[0]?.date).toBe("2026-11-04");
    expect(result.current.chartProps.weekAnchorDate).toBe("2026-11-04");
    await act(() => result.current.chartProps.onPeriodShift(1));
    expect(result.current.selectedDayOffset).toBe(42);
    await act(() => result.current.chartProps.onRangeToday());
    expect(result.current.selectedDayOffset).toBe(0);
  });
  it("hides stale physiology, preserves the schedule, and does not interpolate forecast gaps", async () => {
    const builder = makeBuilder();
    const { result, rerender } = await renderHook(() =>
      useCreationChartController(
        builder as unknown as ReturnType<typeof useTrainingPlanCreationService>,
        {},
      ),
    );
    expect(result.current.chartProps.dailyPoints[0]?.scheduledFitnessCtl).toBe(40);
    expect(result.current.chartProps.dailyPoints[1]?.scheduledFitnessCtl).toBeNull();
    builder.derived.backendPlanningPreview.isStaleInput = true;
    await rerender({});
    expect(result.current.chartProps.dailyPoints[0]).toMatchObject({
      plannedLoad: 0,
      scheduledFitnessCtl: null,
    });
    expect(result.current.forecastAvailable).toBe(false);
    builder.derived.backendPlanningPreview.isStaleInput = false;
    builder.derived.backendPlanningPreview.isFetching = true;
    await rerender({});
    expect(result.current.chartProps.analysisWindowLoading).toBe(false);
    expect(result.current.chartProps.dailyPoints).toHaveLength(42);
    expect(result.current.chartProps.dailyPoints[0]?.scheduledFitnessCtl).toBeNull();
  });
  it("retains selected dates through unrelated renders and follows a moved session", async () => {
    const builder = makeBuilder();
    const { result, rerender } = await renderHook(() =>
      useCreationChartController(
        builder as unknown as ReturnType<typeof useTrainingPlanCreationService>,
        {},
      ),
    );
    await act(() => result.current.selectDate("2027-01-06"));
    await rerender({});
    expect(result.current.selectedDayOffset).toBe(63);
    await act(() => result.current.chartProps.onRangeChange("1y"));
    await act(() => result.current.selectDate("2027-08-04"));
    await act(() => result.current.chartProps.onRangeChange("6w"));
    expect(
      result.current.chartProps.dailyPoints.some(
        (point) => point.date === result.current.selectedDate,
      ),
    ).toBe(true);
    builder.state.selection = { type: "session", sessionId: "s" } as typeof builder.state.selection;
    builder.actions.getSessionById.mockReturnValue({ offsetDays: 70 });
    await rerender({});
    expect(result.current.selectedDayOffset).toBe(70);
  });
  it("preserves the relative selected day when the plan start date changes", async () => {
    const builder = makeBuilder();
    const { result, rerender } = await renderHook(() =>
      useCreationChartController(
        builder as unknown as ReturnType<typeof useTrainingPlanCreationService>,
        {},
      ),
    );
    await act(() => result.current.selectDate("2026-11-13"));
    builder.state.scheduling.startDate = "2026-12-02";
    await rerender({});
    expect(result.current.selectedDayOffset).toBe(9);
    expect(result.current.selectedDate).toBe("2026-12-11");
  });
});
