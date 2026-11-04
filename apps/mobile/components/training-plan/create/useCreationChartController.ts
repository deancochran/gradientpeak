import {
  type ActivityPlanMetric,
  type ActivityPlanSummary,
  type AthletePerformanceTargetFacts,
  addDaysDateOnlyUtc,
  diffDateOnlyUtcDays,
  type PlanAnalysisWindowPeriod,
  shiftPlanAnalysisWindow,
} from "@repo/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { resolveMobileActivityPlanEstimateMetrics } from "@/components/activity-plan/resolveMobileActivityPlanEstimateMetrics";
import type { PlanTrainingChartRange } from "@/components/plan/training-path/trainingPathTypes";
import { omitUndefined } from "@/lib/omitUndefined";
import { buildCreationChartPoints } from "@/lib/training-plan-creation/creationChartPresentation";
import type { useTrainingPlanCreationService } from "@/lib/training-plan-creation/useTrainingPlanCreationService";

export function useCreationChartController(
  builder: ReturnType<typeof useTrainingPlanCreationService>,
  activityPlans: Record<string, ActivityPlanSummary>,
  metricsById?: ReadonlyMap<string, readonly ActivityPlanMetric[]>,
  performanceTargets?: AthletePerformanceTargetFacts,
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
  const sessionMetricsById = useMemo(() => {
    const resolutions = new Map(
      currentPreview?.status === "available"
        ? currentPreview.sessionResults.map((result) => [result.sourceSessionId, result])
        : [],
    );
    return new Map(
      builder.state.structure.sessions.map((session) => {
        const resolution = resolutions.get(session.id);
        const savedMetrics = session.activityPlan
          ? metricsById?.get(session.activityPlan.id)
          : undefined;
        if (!resolution)
          return [
            session.localId,
            session.demand.target_common_load != null ||
            session.demand.target_duration_minutes != null
              ? []
              : (savedMetrics ?? []),
          ] as const;
        if (resolution.status !== "resolved") return [session.localId, []] as const;
        const metrics = resolveMobileActivityPlanEstimateMetrics({
          structure: resolution.manifest.resolved_structure,
          persistedMetrics: [],
          ...omitUndefined({ performanceTargets }),
        });
        const estimate = resolution.manifest.prescription_estimate;
        const load: ActivityPlanMetric =
          estimate.common_load.value === null || estimate.common_load.status !== "complete"
            ? {
                key: "common_load",
                label: "Common Load",
                value: null,
                status: "unavailable",
                unit: "score",
                reason:
                  estimate.common_load.status === "partial"
                    ? "incomplete_members"
                    : "not_available",
                provenance: null,
              }
            : {
                key: "common_load",
                label: "Common Load",
                value: estimate.common_load.value,
                status: "available",
                unit: "score",
                reason: null,
                provenance: "estimated",
              };
        const duration: ActivityPlanMetric =
          estimate.duration.value_seconds === null
            ? {
                key: "elapsed_duration",
                label: "Duration",
                value: null,
                status: "unavailable",
                unit: "seconds",
                reason: "not_available",
                provenance: null,
              }
            : {
                key: "elapsed_duration",
                label: "Duration",
                value: estimate.duration.value_seconds,
                status: "available",
                unit: "seconds",
                reason: null,
                provenance: estimate.duration.status === "exact" ? "authored" : "estimated",
              };
        return [
          session.localId,
          [
            ...metrics.filter(
              (metric) => metric.key !== "common_load" && metric.key !== "elapsed_duration",
            ),
            load,
            duration,
          ],
        ] as const;
      }),
    );
  }, [builder.state.structure.sessions, currentPreview, metricsById, performanceTargets]);
  return {
    sessionMetricsById,
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
        ...(metricsById ? { metricsById } : {}),
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
    forecastPartial:
      currentPreview?.status === "available" &&
      (!currentPreview.applicable ||
        currentPreview.sessionResults.some(
          (result) =>
            result.status !== "resolved" ||
            result.manifest.prescription_estimate.common_load.status !== "complete",
        )),
  };
}
