import {
  type ActivityPlanSummary,
  addDaysDateOnlyUtc,
  diffDateOnlyUtcDays,
  type PlanAnalysisWindowPeriod,
  shiftPlanAnalysisWindow,
} from "@repo/core";
import { useEffect, useRef, useState } from "react";
import type { PlanTrainingChartRange } from "@/components/plan/training-path/trainingPathTypes";
import { buildCreationChartPoints } from "@/lib/training-plan-creation/creationChartPresentation";
import type { useTrainingPlanCreationService } from "@/lib/training-plan-creation/useTrainingPlanCreationService";

export function useCreationChartController(
  builder: ReturnType<typeof useTrainingPlanCreationService>,
  activityPlans: Record<string, ActivityPlanSummary>,
) {
  const startDate = builder.state.scheduling.startDate;
  const [selected, setSelected] = useState(startDate);
  const [windowStart, setWindowStart] = useState(startDate);
  const [period, setPeriod] = useState<PlanAnalysisWindowPeriod>("6w");
  const [binning, setBinning] = useState<PlanTrainingChartRange>("weekly");
  const previousStart = useRef(startDate);
  useEffect(() => {
    const previous = previousStart.current;
    if (previous === startDate) return;
    previousStart.current = startDate;
    setSelected((date) =>
      addDaysDateOnlyUtc(startDate, Math.max(0, diffDateOnlyUtcDays(previous, date))),
    );
    setWindowStart((date) =>
      addDaysDateOnlyUtc(startDate, Math.max(0, diffDateOnlyUtcDays(previous, date))),
    );
  }, [startDate]);
  const selectedDate = selected < startDate ? startDate : selected;
  const from = windowStart < startDate ? startDate : windowStart;
  const next = shiftPlanAnalysisWindow({ anchorDate: from, period, direction: 1 }).anchorDate;
  const end = addDaysDateOnlyUtc(next, -1);
  const selectDate = (date: string) => {
    const clamped = date < startDate ? startDate : date;
    setSelected(clamped);
    if (clamped < from || clamped > end) setWindowStart(clamped);
  };
  const focusedSession =
    builder.state.selection.type === "session"
      ? builder.actions.getSessionById(builder.state.selection.sessionId)
      : null;
  const focusedOffset = focusedSession?.offsetDays;
  useEffect(() => {
    if (focusedOffset == null) return;
    const date = addDaysDateOnlyUtc(startDate, focusedOffset);
    setSelected(date);
    setWindowStart(addDaysDateOnlyUtc(startDate, Math.floor(focusedOffset / 7) * 7));
  }, [focusedOffset, startDate]);
  const preview = builder.derived.backendPlanningPreview;
  const currentPreview =
    !preview.isStaleInput && !preview.isFetching && !preview.error && preview.isEnabled
      ? (preview.data ?? null)
      : null;
  return {
    selectedDate,
    selectedDayOffset: Math.max(0, diffDateOnlyUtcDays(startDate, selectedDate)),
    selectDate,
    chartProps: {
      analysisAnchor: from,
      analysisPeriod: period,
      // The local schedule is ready even while the server recomputes physiology.
      analysisWindowLoading: false,
      dailyPoints: buildCreationChartPoints({
        startDate,
        windowStart: from,
        windowEnd: end,
        sessions: builder.state.structure.sessions,
        activityPlans,
        preview: currentPreview,
      }),
      todayKey: startDate,
      todayLabel: "START",
      selectedDate,
      binning,
      onBinningChange: setBinning,
      onPeriodShift: (direction: -1 | 1) => {
        const shifted = shiftPlanAnalysisWindow({ anchorDate: from, period, direction }).anchorDate;
        const date = shifted < startDate ? startDate : shifted;
        setWindowStart(date);
        setSelected(date);
      },
      onRangeChange: (nextPeriod: PlanAnalysisWindowPeriod) => {
        setPeriod(nextPeriod);
        setWindowStart(selectedDate);
      },
      onRangeToday: () => {
        setWindowStart(startDate);
        setSelected(startDate);
      },
      onSelectedDateChange: selectDate,
      weekAnchorDate: startDate,
      resetLabel: "Plan start",
      previousDisabled: from === startDate,
    },
    forecastAvailable: currentPreview?.status === "available",
    forecastPartial: currentPreview?.status === "available" && !currentPreview.applicable,
  };
}
