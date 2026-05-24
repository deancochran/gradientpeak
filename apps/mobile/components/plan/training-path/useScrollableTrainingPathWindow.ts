import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import type { TrainingPathSourceGoalMarker, TrainingPathWeekWindow } from "./trainingPathTypes";
import { addDays, buildScrollableTrainingPathWindow } from "./trainingPathUtils";

type UseScrollableTrainingPathWindowParams = {
  goalMarkers?: TrainingPathSourceGoalMarker[] | null;
  todayKey: string;
};

export function useScrollableTrainingPathWindow({
  goalMarkers,
  todayKey,
}: UseScrollableTrainingPathWindowParams) {
  const [weekWindow, setWeekWindow] = useState<TrainingPathWeekWindow | null>(null);
  const initialWeekWindow = useMemo(
    () => buildScrollableTrainingPathWindow({ goalMarkers, todayKey }),
    [goalMarkers, todayKey],
  );

  useEffect(() => {
    setWeekWindow((current) => current ?? initialWeekWindow);
  }, [initialWeekWindow]);

  const resolvedWeekWindow = weekWindow ?? initialWeekWindow;
  const extendWindowStart = useCallback(() => {
    startTransition(() => {
      setWeekWindow((current) => {
        const window = current ?? initialWeekWindow;
        return { ...window, start: addDays(window.start, -56) };
      });
    });
  }, [initialWeekWindow]);

  const extendWindowEnd = useCallback(() => {
    startTransition(() => {
      setWeekWindow((current) => {
        const window = current ?? initialWeekWindow;
        return { ...window, end: addDays(window.end, 56) };
      });
    });
  }, [initialWeekWindow]);

  const resetWindow = useCallback(() => {
    startTransition(() => {
      setWeekWindow(initialWeekWindow);
    });
  }, [initialWeekWindow]);

  return {
    initialWeekWindow,
    resolvedWeekWindow,
    extendWindowEnd,
    extendWindowStart,
    resetWindow,
  };
}
