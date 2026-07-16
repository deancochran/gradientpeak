import { act, renderHook } from "@testing-library/react-native";
import { useScrollableTrainingPathWindow } from "./useScrollableTrainingPathWindow";

describe("useScrollableTrainingPathWindow", () => {
  it("expands an initialized window when goal markers arrive without discarding an edge extension", () => {
    let goalMarkers: Array<{ id: string; targetDate: string }> = [];
    const { result, rerender } = renderHook(() =>
      useScrollableTrainingPathWindow({
        goalMarkers,
        todayKey: "2026-04-06",
      }),
    );

    act(() => result.current.extendWindowEnd());
    const extendedEnd = result.current.resolvedWeekWindow.end;

    goalMarkers = [{ id: "goal-1", targetDate: "2027-12-31" }];
    rerender({});

    expect(result.current.resolvedWeekWindow.end).toBe("2028-02-21");
    expect(result.current.resolvedWeekWindow.end >= extendedEnd).toBe(true);
  });
});
