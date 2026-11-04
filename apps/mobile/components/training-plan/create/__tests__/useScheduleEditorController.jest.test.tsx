import { act, renderHook } from "@testing-library/react-native";
import { Alert } from "react-native";
import type { TrainingPlanBuilderSession } from "@/lib/training-plan-creation/types";
import { useScheduleEditorController } from "../useScheduleEditorController";
import type { TrainingPlanBuilderController } from "../useTrainingPlanBuilderController";

it("rejects a week copy at the activity limit without changing the schedule", async () => {
  const sessions: TrainingPlanBuilderSession[] = Array.from({ length: 366 }, (_, index) => ({
    id: `session-${index}`,
    localId: `session-${index}`,
    offsetDays: index,
    activityPlan: null,
    demand: {
      activity_category: "run",
      training_intent: "aerobic_base",
      importance: "normal",
      target_duration_minutes: 30,
      target_common_load: 20,
    },
  }));
  const duplicateSession = jest.fn();
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  const controller = {
    builder: {
      state: { selection: { type: "overview" }, structure: { sessions } },
      derived: { viewModel: { schedule: { viewModel: { timelineWeeks: [] } } } },
      actions: { duplicateSession },
    },
    actions: { addSessionAtOffset: jest.fn(), confirmRemoveSession: jest.fn() },
    selection: { setSessionId: jest.fn() },
    sheetStack: { openSheet: jest.fn() },
    chartReview: { selectedWeekIndex: 0 },
    creationChart: { sessionMetricsById: new Map() },
  } as unknown as TrainingPlanBuilderController;
  try {
    const { result } = await renderHook(() => useScheduleEditorController(controller));
    await act(() => result.current.onCopyWeek(0, 1));
    expect(duplicateSession).not.toHaveBeenCalled();
    expect(sessions).toHaveLength(366);
    expect(alert).toHaveBeenCalledWith(
      "Week couldn’t be copied",
      "This plan has reached its activity limit.",
    );
  } finally {
    alert.mockRestore();
  }
});
