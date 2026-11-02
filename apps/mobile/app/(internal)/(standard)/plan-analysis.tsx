import { PLAN_ANALYSIS_WINDOW_PERIODS, type PlanAnalysisWindowPeriod } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Tabs, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { Text } from "@repo/ui/components/text";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, View } from "react-native";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { PlanInsightControls } from "@/components/plan/insights/PlanInsightControls";
import { PlanProgressInsight } from "@/components/plan/insights/PlanProgressInsight";
import { PlanTrainingInsight } from "@/components/plan/insights/PlanTrainingInsight";
import {
  buildComparableThresholdTrend,
  getPlanProgressWindow,
  getPlanTrainingWindow,
  mergeGoalProgressThresholdEvidence,
  type PlanAnalysisRange,
  type PlanAnalysisView,
  type PlanProgressRange,
  type PlanTrainingMetric,
  type PlanTrainingRange,
  shiftPlanProgressAnchor,
  shiftPlanTrainingAnchor,
} from "@/components/plan/training-path/planDashboardPresentation";
import { usePlanTrainingPathData } from "@/components/plan/training-path/usePlanTrainingPathData";
import { useProductAnalytics } from "@/lib/analytics/productAnalytics";
import { api } from "@/lib/api";
import { addDaysToDateKey, isCanonicalDateKey } from "@/lib/calendar/dateMath";
import { ROUTES } from "@/lib/constants/routes";
import { usePerformanceScreenReady } from "@/lib/performance";

type RouteMetric = "threshold" | PlanTrainingMetric;
type AnalysisParams = {
  anchorDate?: string | string[];
  goalId?: string | string[];
  metric?: string | string[];
  range?: string | string[];
  view?: string | string[];
};

const rangeLabels: Record<PlanAnalysisWindowPeriod, string> = {
  "1y": "1 year",
  "3m": "3 months",
  "6m": "6 months",
  "6w": "6 weeks",
};
const analysisRanges = PLAN_ANALYSIS_WINDOW_PERIODS.map((value) => ({
  label: rangeLabels[value],
  value,
}));
const trainingMetrics: Array<{ label: string; value: PlanTrainingMetric }> = [
  { label: "Load", value: "load" },
  { label: "Fitness", value: "fitness" },
  { label: "Fatigue", value: "fatigue" },
  { label: "Form", value: "form" },
];

function scalar(value: string | string[] | undefined) {
  return typeof value === "string" ? value : null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string | null): value is string {
  return Boolean(value && UUID_PATTERN.test(value));
}

function parseView(value: string | null): PlanAnalysisView {
  return value === "training" ? "training" : "progress";
}

function parseMetric(view: PlanAnalysisView, value: string | null): RouteMetric {
  if (view === "progress") return "threshold";
  return value === "fitness" || value === "fatigue" || value === "form" ? value : "load";
}

function parseRange(view: PlanAnalysisView, value: string | null): PlanAnalysisRange {
  void view;
  return value && PLAN_ANALYSIS_WINDOW_PERIODS.includes(value as PlanAnalysisWindowPeriod)
    ? (value as PlanAnalysisWindowPeriod)
    : "6w";
}

function PlanAnalysisContent({
  goalId,
  metric,
  range,
  routeAnchorDate,
  view,
}: {
  goalId: string;
  metric: RouteMetric;
  range: PlanAnalysisRange;
  routeAnchorDate: string;
  view: PlanAnalysisView;
}) {
  const router = useRouter();
  const productAnalytics = useProductAnalytics();
  const trainingPath = usePlanTrainingPathData({ anchorDate: routeAnchorDate, period: range });
  const anchorDate = routeAnchorDate;
  usePerformanceScreenReady("route-plan-analysis");
  const progressQuery = api.athleteIntelligence.getGoalProgress.useQuery(
    { goalId },
    { enabled: trainingPath.planningTimezoneState === "ready" },
  );
  const thresholdQuery = api.athleteIntelligence.getThresholdOverview.useQuery(
    { historyLimit: 100 },
    { enabled: view === "progress" && trainingPath.planningTimezoneState === "ready" },
  );
  if (trainingPath.planningTimezoneState !== "ready") {
    return (
      <View className="flex-1 gap-3 bg-background p-4" testID="plan-analysis-initializing">
        {trainingPath.timezoneSetupError ? (
          <>
            <Text accessibilityRole="alert">{trainingPath.timezoneSetupError}</Text>
            <Button
              onPress={() => void trainingPath.retryTimezoneInitialization()}
              disabled={trainingPath.timezoneInitializing}
            >
              <Text>Retry</Text>
            </Button>
          </>
        ) : (
          <Text>Preparing your plan…</Text>
        )}
      </View>
    );
  }
  const progress = progressQuery.data?.result;
  const progressEvidence = mergeGoalProgressThresholdEvidence(
    thresholdQuery.data?.history.items ?? [],
    progressQuery.data?.provenance,
  );
  const trend = buildComparableThresholdTrend(
    progressEvidence,
    progress && progress.status !== "unsupported" ? progress.target.activityCategory : null,
    progress && progress.status !== "unsupported"
      ? { metric: progress.target.metric, unit: progress.target.unit }
      : null,
  );
  const timelineStart = trainingPath.timelineStartDate ?? trainingPath.trainingPath.todayKey;
  const timelineEnd = trainingPath.timelineEndDate ?? trainingPath.trainingPath.todayKey;
  const selectedGoal = trainingPath.goalMarkers.find((goal) => goal.id === goalId) ?? null;
  const progressRange = range as PlanProgressRange;
  const trainingRange = range as PlanTrainingRange;
  const progressWindow = getPlanProgressWindow(anchorDate, progressRange);
  const trainingWindow = getPlanTrainingWindow({
    anchorDate,
    range: trainingRange,
    timelineEnd,
    timelineStart,
  });
  const updateRoute = (
    changes: Partial<{
      anchorDate: string;
      goalId: string;
      metric: RouteMetric;
      range: PlanAnalysisRange;
      view: PlanAnalysisView;
    }>,
  ) => {
    const nextView = changes.view ?? view;
    const nextMetric =
      changes.metric ??
      (nextView === view ? metric : nextView === "progress" ? "threshold" : "load");
    const nextRange = changes.range ?? range;
    router.replace(
      ROUTES.PLAN.ANALYSIS({
        anchorDate: changes.anchorDate ?? anchorDate,
        goalId: changes.goalId ?? goalId,
        metric: nextMetric,
        range: nextRange,
        view: nextView,
      }) as never,
    );
  };

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 px-4 pb-8 pt-4"
      testID="plan-analysis-screen"
    >
      <View className="gap-1">
        <Text accessibilityRole="header" className="text-xl font-semibold text-foreground">
          Plan analysis
        </Text>
        <Text className="text-sm text-muted-foreground">
          Metric, range, view, goal, and anchor date are owned by this route.
        </Text>
      </View>
      <Tabs
        onValueChange={(nextView) => {
          const option = nextView as PlanAnalysisView;
          productAnalytics.capture("plan.analysis_view_changed", { view: option });
          updateRoute({ view: option });
        }}
        value={view}
      >
        <TabsList className="flex-row rounded-xl bg-muted/30 p-1">
          {(["progress", "training"] as const).map((option) => {
            const selected = option === view;
            return (
              <TabsTrigger
                accessibilityLabel={`Show ${option} analysis`}
                accessibilityState={{ selected }}
                className={`min-h-11 flex-1 items-center justify-center rounded-lg ${selected ? "bg-card" : ""}`}
                key={option}
                testId={`plan-analysis-view-${option}`}
                value={option}
              >
                <Text
                  className={`font-semibold capitalize ${selected ? "text-foreground" : "text-muted-foreground"}`}
                >
                  {option}
                </Text>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
      {view === "training" ? (
        <Tabs
          onValueChange={(nextMetric) => {
            const option = nextMetric as PlanTrainingMetric;
            productAnalytics.capture("plan.analysis_metric_changed", { metric: option });
            updateRoute({ metric: option });
          }}
          value={metric}
        >
          <TabsList
            className="h-auto flex-row flex-wrap gap-2 bg-transparent p-0"
            testId="plan-analysis-metrics"
          >
            {trainingMetrics.map((option) => {
              const selected = metric === option.value;
              return (
                <TabsTrigger
                  accessibilityLabel={`Analyze ${option.label}`}
                  accessibilityState={{ selected }}
                  className={`min-h-11 min-w-[46%] flex-1 items-center justify-center rounded-xl border px-3 ${
                    selected ? "border-primary bg-primary/10" : "border-border"
                  }`}
                  key={option.value}
                  testId={`plan-analysis-metric-${option.value}`}
                  value={option.value}
                >
                  <Text
                    className={
                      selected ? "font-semibold text-primary" : "font-semibold text-foreground"
                    }
                  >
                    {option.label}
                  </Text>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
      ) : null}
      {view === "progress" ? (
        <>
          <PlanInsightControls
            anchorLabel={`Centered evidence window around ${anchorDate}`}
            canGoNext={anchorDate < trainingPath.trainingPath.todayKey}
            onGoNext={() => {
              const next = shiftPlanProgressAnchor(anchorDate, progressRange, 1);
              updateRoute({
                anchorDate:
                  next > trainingPath.trainingPath.todayKey
                    ? trainingPath.trainingPath.todayKey
                    : next,
              });
            }}
            onGoPrevious={() =>
              updateRoute({
                anchorDate: shiftPlanProgressAnchor(anchorDate, progressRange, -1),
              })
            }
            onRangeChange={(nextRange) => {
              productAnalytics.capture("plan.range_selected", { range: nextRange });
              updateRoute({ range: nextRange });
            }}
            onToday={() => updateRoute({ anchorDate: trainingPath.trainingPath.todayKey })}
            ranges={analysisRanges}
            selectedRange={progressRange}
            testID="plan-analysis-progress-controls"
          />
          {progressQuery.isLoading || thresholdQuery.isLoading ? (
            <View className="h-44 items-center justify-center rounded-2xl bg-card">
              <Text className="text-sm text-muted-foreground">Loading progress analysis…</Text>
            </View>
          ) : progressQuery.isError || thresholdQuery.isError ? (
            <View
              accessibilityRole="alert"
              className="rounded-2xl border border-destructive/40 bg-card p-4"
            >
              <Text className="font-semibold text-foreground">
                Progress analysis is unavailable
              </Text>
            </View>
          ) : (
            <PlanProgressInsight
              deadlineDate={
                progress && progress.status !== "unsupported"
                  ? progress.deadlineAt.slice(0, 10)
                  : (selectedGoal?.targetDate ?? null)
              }
              onOpenSourceActivity={(activityId) =>
                router.navigate(ROUTES.ACTIVITIES.DETAIL(activityId) as never)
              }
              progress={progress}
              todayKey={trainingPath.trainingPath.todayKey}
              trend={trend}
              window={progressWindow}
            />
          )}
        </>
      ) : (
        <>
          <PlanInsightControls
            anchorLabel={`Centered training window around ${anchorDate}: ${trainingWindow.start} to ${trainingWindow.end}`}
            canGoNext={trainingWindow.end < timelineEnd}
            canGoPrevious={trainingWindow.start > timelineStart}
            onGoNext={() =>
              updateRoute({
                anchorDate: shiftPlanTrainingAnchor({
                  anchorDate,
                  direction: 1,
                  range: trainingRange,
                  timelineEnd,
                  timelineStart,
                }),
              })
            }
            onGoPrevious={() =>
              updateRoute({
                anchorDate: shiftPlanTrainingAnchor({
                  anchorDate,
                  direction: -1,
                  range: trainingRange,
                  timelineEnd,
                  timelineStart,
                }),
              })
            }
            onRangeChange={(nextRange) => {
              productAnalytics.capture("plan.range_selected", { range: nextRange });
              updateRoute({ range: nextRange });
            }}
            onToday={() => updateRoute({ anchorDate: trainingPath.trainingPath.todayKey })}
            ranges={analysisRanges}
            selectedRange={trainingRange}
            testID="plan-analysis-training-controls"
          />
          {metric !== "load" && trainingPath.trainingPath.fitnessHistoryNotice ? (
            <Text className="text-sm text-muted-foreground" testID="plan-analysis-freshness">
              {trainingPath.trainingPath.fitnessHistoryNotice}
            </Text>
          ) : null}
          <PlanTrainingInsight
            goalDate={selectedGoal?.targetDate ?? null}
            metric={metric as PlanTrainingMetric}
            onAdd={(date) => {
              productAnalytics.capture("plan.calendar_action", { action: "add" });
              router.navigate(ROUTES.PLAN.AGENDA_CREATE(date) as never);
            }}
            onNextSelectedDate={() =>
              updateRoute({
                anchorDate:
                  anchorDate < timelineEnd ? addDaysToDateKey(anchorDate, 1) : timelineEnd,
              })
            }
            onOpenDetails={(date) => {
              productAnalytics.capture("plan.calendar_action", { action: "details" });
              router.navigate(
                ROUTES.PLAN.PLANNING_LEDGER({ anchorDate: date, period: "day" }) as never,
              );
            }}
            onPreviousSelectedDate={() =>
              updateRoute({
                anchorDate:
                  anchorDate > timelineStart ? addDaysToDateKey(anchorDate, -1) : timelineStart,
              })
            }
            onSelectDate={(date) => updateRoute({ anchorDate: date })}
            points={trainingPath.dailyTrainingPathPoints}
            selectedDate={anchorDate}
            todayKey={trainingPath.trainingPath.todayKey}
            window={trainingWindow}
          />
        </>
      )}
    </ScrollView>
  );
}

function PlanAnalysisScreen() {
  const rawParams = useLocalSearchParams<AnalysisParams>();
  const goalId = scalar(rawParams.goalId);
  const routeAnchorDate = scalar(rawParams.anchorDate);
  const view = parseView(scalar(rawParams.view));
  const metric = parseMetric(view, scalar(rawParams.metric));
  const range = parseRange(view, scalar(rawParams.range));

  if (!routeAnchorDate || !isCanonicalDateKey(routeAnchorDate) || !isUuid(goalId)) {
    return (
      <View
        className="flex-1 items-center justify-center gap-2 bg-background px-6"
        testID="plan-analysis-invalid"
      >
        <Text accessibilityRole="header" className="text-xl font-semibold text-foreground">
          Open analysis from Plan
        </Text>
        <Text className="text-center text-sm text-muted-foreground">
          A valid goal and anchor date are required so this analysis remains shareable and
          reproducible.
        </Text>
      </View>
    );
  }

  return (
    <PlanAnalysisContent
      goalId={goalId}
      metric={metric}
      range={range}
      routeAnchorDate={routeAnchorDate}
      view={view}
    />
  );
}

export default function PlanAnalysisWithBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <PlanAnalysisScreen />
    </ErrorBoundary>
  );
}
