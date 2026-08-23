import { act, renderHook } from "@testing-library/react-native";
import { useScrollableTrainingPathWindow } from "./useScrollableTrainingPathWindow";

describe("useScrollableTrainingPathWindow", () => {
  it("does not schedule updates when an equivalent window is rebuilt on rerender", async () => {
    const { result, rerender } = await renderHook(() =>
      useScrollableTrainingPathWindow({
        goalMarkers: [],
        todayKey: "2026-04-06",
      }),
    );

    await rerender({});

    expect(result.current.resolvedWeekWindow).toEqual({
      start: "2026-01-12",
      end: "2027-04-05",
    });
  });

  it("does not retain an empty startup window when the planning date becomes available", async () => {
    let todayKey = "";
    const { result, rerender } = await renderHook(() =>
      useScrollableTrainingPathWindow({
        todayKey,
      }),
    );

    expect(result.current.resolvedWeekWindow).toEqual({ start: "", end: "" });

    todayKey = "2026-07-18";
    await rerender({});

    expect(result.current.resolvedWeekWindow).toEqual({
      start: "2026-04-20",
      end: "2027-07-12",
    });
  });

  it("expands an initialized window when goal markers arrive without discarding an edge extension", async () => {
    let goalMarkers: Array<{ id: string; targetDate: string }> = [];
    const { result, rerender } = await renderHook(() =>
      useScrollableTrainingPathWindow({
        goalMarkers,
        todayKey: "2026-04-06",
      }),
    );

    await act(() => result.current.extendWindowEnd());
    const extendedEnd = result.current.resolvedWeekWindow.end;

    goalMarkers = [{ id: "goal-1", targetDate: "2027-12-31" }];
    await rerender({});

    expect(result.current.resolvedWeekWindow.end).toBe("2028-02-21");
    expect(result.current.resolvedWeekWindow.end >= extendedEnd).toBe(true);
  });
});
