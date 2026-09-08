import type { AppRouter, inferRouterOutputs } from "@repo/api/client";
import type { PlanningLedger } from "@repo/core";

export type TrainingComposition =
  inferRouterOutputs<AppRouter>["trainingPlans"]["getPlanningLedger"]["trainingComposition"];

type MetricValue = PlanningLedger["load"]["completed"];

export type LedgerDayPresentation = {
  accessibilityLabel: string;
  completed: number | null;
  completedLabel: string;
  consistencyLabel: string;
  date: string;
  dateLabel: string;
  durationLabel: string;
  intensityLabel: string;
  planned: number | null;
  plannedLabel: string;
  shortDateLabel: string;
  shortDayLabel: string;
};

export type TrainingStatePointPresentation = {
  actualFatigue: number | null;
  actualFitness: number | null;
  actualForm: number | null;
  date: string;
  index: number;
  projectedFatigue: number | null;
  projectedFitness: number | null;
  projectedForm: number | null;
};

export type DurationCompositionCategoryPresentation = {
  activityCategory: string;
  completedDuration: number | null;
  completedLabel: string;
  label: string;
  plannedDuration: number | null;
  plannedLabel: string;
};

export type DurationCompositionPresentation = {
  activeDaysLabel: string | null;
  categories: DurationCompositionCategoryPresentation[];
  completedDuration: number | null;
  completedLabel: string;
  plannedDuration: number | null;
  plannedLabel: string;
  sessionsLabel: string | null;
};

export type IntensityBandPresentation = {
  band: PlanningLedger["intensityDistribution"]["bands"][number]["band"];
  durationLabel: string;
  label: string;
  percentage: number;
  percentageLabel: string;
};

export type PlanningLedgerPresentation = {
  days: LedgerDayPresentation[];
  diagnostics: {
    asOfLabel: string;
    entriesTruncated: boolean;
    modelLines: string[];
    planningTimezone: string;
    sourceWindows: { key: string; label: string; value: string }[];
  };
  durationComposition: DurationCompositionPresentation;
  intensity: {
    bands: IntensityBandPresentation[];
    durationLabel: string;
    summary: string;
  };
  load: {
    completed: number | null;
    completedLabel: string;
    planned: number | null;
    plannedLabel: string;
    progressPercent: number | null;
    title: string;
    varianceLabel: string | null;
  };
  periodLabel: string;
  state: {
    fatigueDirection: "Falling" | "Rising" | "Stable";
    latestFatigueLabel: string;
    fitnessDirection: "Falling" | "Rising" | "Stable";
    latestFitnessLabel: string;
    latestFormLabel: string;
    latestSource: "Recorded" | "Projected" | null;
    formDirection: "Falling" | "Rising" | "Stable";
    points: TrainingStatePointPresentation[];
    summary: string;
  };
};

export function metricNumber(metric: MetricValue): number | null {
  return metric.status === "unavailable" || metric.value === null ? null : metric.value;
}

function formatNumber(value: number, maximumFractionDigits = 1) {
  return value.toLocaleString(undefined, { maximumFractionDigits });
}

export function formatLoadMetric(metric: MetricValue) {
  const value = metricNumber(metric);
  return value === null ? "—" : formatNumber(value);
}

export function formatDurationSeconds(value: number | null) {
  if (value === null) return "—";
  const minutes = Math.round(value / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours}h${remainder ? ` ${remainder}m` : ""}`;
}

export function formatMetricDuration(metric: MetricValue) {
  return formatDurationSeconds(metricNumber(metric));
}

export function formatIntensityMetric(metric: MetricValue) {
  const value = metricNumber(metric);
  return value === null ? "—" : value.toFixed(2);
}

export function formatLedgerDate(date: string) {
  return new Date(`${date}T00:00:00.000Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatAsOf(asOf: string, timezone: string | null) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      ...(timezone ? { timeZone: timezone } : {}),
    }).format(new Date(asOf));
  } catch {
    return asOf;
  }
}

function loadPosition(completed: number | null, planned: number | null) {
  if (completed === null && planned === null) return "Training load unavailable";
  if (planned === null) return "Completed load recorded";
  if (planned === 0) return completed !== null && completed > 0 ? "Training recorded" : "Rest day";
  if (completed === null || completed === 0) return "Ready to train";
  if (completed > planned) return "Above planned load";
  if (completed === planned) return "Plan completed";
  return "In progress";
}

function dayConsistency(completed: number | null, planned: number | null) {
  if (completed === null && planned === null) return "No load data";
  if ((completed ?? 0) === 0 && (planned ?? 0) === 0) return "Rest day";
  if (planned !== null && planned > 0 && completed !== null && completed >= planned)
    return "On plan";
  if (completed !== null && completed > 0) return "Training recorded";
  if (planned !== null && planned > 0) return "Planned";
  return "No load recorded";
}

function buildDays(ledger: PlanningLedger): LedgerDayPresentation[] {
  return ledger.dailyBreakdown.map((day) => {
    const completed = metricNumber(day.completed);
    const planned = metricNumber(day.planned);
    const dateLabel = formatLedgerDate(day.date);
    const completedLabel = formatLoadMetric(day.completed);
    const plannedLabel = formatLoadMetric(day.planned);
    const durationLabel = formatMetricDuration(day.contributingDurationSeconds);
    const intensityLabel = formatIntensityMetric(day.intensity);
    const consistencyLabel = dayConsistency(completed, planned);
    const date = new Date(`${day.date}T00:00:00.000Z`);
    return {
      accessibilityLabel: `${dateLabel}. ${consistencyLabel}. Completed ${completedLabel}. Planned ${plannedLabel}.`,
      completed,
      completedLabel,
      consistencyLabel,
      date: day.date,
      dateLabel,
      durationLabel,
      intensityLabel,
      planned,
      plannedLabel,
      shortDateLabel: date.toLocaleDateString(undefined, { day: "numeric", timeZone: "UTC" }),
      shortDayLabel: date.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" }),
    };
  });
}

function stateValue(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function buildState(ledger: PlanningLedger): PlanningLedgerPresentation["state"] {
  const points = ledger.trainingState.series.map((point, index) => {
    return {
      actualFatigue: stateValue(point.actual?.fatigue),
      actualFitness: stateValue(point.actual?.fitness),
      actualForm: stateValue(point.actual?.form),
      date: point.date,
      index,
      projectedFatigue: stateValue(point.planned?.fatigue),
      projectedFitness: stateValue(point.planned?.fitness),
      projectedForm: stateValue(point.planned?.form),
    };
  });
  const latest = [...points]
    .reverse()
    .find((point) =>
      [
        point.actualFitness,
        point.actualFatigue,
        point.actualForm,
        point.projectedFitness,
        point.projectedFatigue,
        point.projectedForm,
      ].some((value) => value !== null),
    );
  const latestSource = latest
    ? latest.actualFitness !== null || latest.actualFatigue !== null || latest.actualForm !== null
      ? ("Recorded" as const)
      : ("Projected" as const)
    : null;
  const latestFitness = latest?.actualFitness ?? latest?.projectedFitness;
  const latestFatigue = latest?.actualFatigue ?? latest?.projectedFatigue;
  const latestForm = latest?.actualForm ?? latest?.projectedForm;
  const latestFitnessLabel =
    latestFitness === null || latestFitness === undefined ? "—" : formatNumber(latestFitness);
  const latestFatigueLabel =
    latestFatigue === null || latestFatigue === undefined ? "—" : formatNumber(latestFatigue);
  const latestFormLabel =
    latestForm === null || latestForm === undefined ? "—" : formatNumber(latestForm);
  const direction = (key: "fitness" | "fatigue" | "form") => {
    const values = points
      .map((point) => {
        const capitalized = `${key.charAt(0).toUpperCase()}${key.slice(1)}` as
          | "Fatigue"
          | "Fitness"
          | "Form";
        return point[`actual${capitalized}`] ?? point[`projected${capitalized}`];
      })
      .filter((value): value is number => value !== null);
    if (values.length < 2) return "Stable";
    const first = values[0] ?? 0;
    const last = values.at(-1) ?? first;
    const change = last - first;
    return Math.abs(change) < 0.1 ? "Stable" : change > 0 ? "Rising" : "Falling";
  };
  const range = points.length
    ? `${formatLedgerDate(points[0]?.date ?? ledger.periodStart)} to ${formatLedgerDate(points.at(-1)?.date ?? ledger.periodEnd)}`
    : "the selected period";
  return {
    fatigueDirection: direction("fatigue"),
    latestFatigueLabel,
    fitnessDirection: direction("fitness"),
    latestFitnessLabel,
    latestFormLabel,
    latestSource,
    formDirection: direction("form"),
    points,
    summary: `Training state from ${range}. ${latestSource ?? "Latest"} fitness ${latestFitnessLabel}, fatigue ${latestFatigueLabel}, form ${latestFormLabel}. Recorded and projected segments are shown separately.`,
  };
}

function compositionMetricValue(metric: { status: string; value: number | null }) {
  return metric.status === "unavailable" || metric.value === null ? null : metric.value;
}

function categoryTitle(category: string) {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

export function buildDurationCompositionPresentation(
  composition?: TrainingComposition | null,
): DurationCompositionPresentation {
  if (!composition) {
    return {
      activeDaysLabel: null,
      categories: [],
      completedDuration: null,
      completedLabel: "—",
      plannedDuration: null,
      plannedLabel: "—",
      sessionsLabel: null,
    };
  }
  const actual = composition.selected.actual;
  const planned = composition.selected.planned;
  const categoryNames = [
    ...actual.categories.map((category) => category.activityCategory),
    ...planned.categories
      .map((category) => category.activityCategory)
      .filter((name) => !actual.categories.some((category) => category.activityCategory === name)),
  ];
  const categories = categoryNames.map((activityCategory) => {
    const completedDuration = compositionMetricValue(
      actual.categories.find((category) => category.activityCategory === activityCategory)
        ?.durationSeconds ?? { status: "unavailable", value: null },
    );
    const plannedDuration = compositionMetricValue(
      planned.categories.find((category) => category.activityCategory === activityCategory)
        ?.durationSeconds ?? { status: "unavailable", value: null },
    );
    return {
      activityCategory,
      completedDuration,
      completedLabel: formatDurationSeconds(completedDuration),
      label: categoryTitle(activityCategory),
      plannedDuration,
      plannedLabel: formatDurationSeconds(plannedDuration),
    };
  });
  const completedDuration = categories.some((category) => category.completedDuration !== null)
    ? categories.reduce((total, category) => total + (category.completedDuration ?? 0), 0)
    : null;
  const plannedDuration = categories.some((category) => category.plannedDuration !== null)
    ? categories.reduce((total, category) => total + (category.plannedDuration ?? 0), 0)
    : null;
  const sessions = compositionMetricValue(actual.sessions);
  const activeDays = compositionMetricValue(actual.activeDays);
  return {
    activeDaysLabel:
      activeDays === null
        ? null
        : `${Math.round(activeDays)} active ${Math.round(activeDays) === 1 ? "day" : "days"}`,
    categories,
    completedDuration,
    completedLabel: formatDurationSeconds(completedDuration),
    plannedDuration,
    plannedLabel: formatDurationSeconds(plannedDuration),
    sessionsLabel:
      sessions === null
        ? null
        : `${Math.round(sessions)} ${Math.round(sessions) === 1 ? "session" : "sessions"}`,
  };
}

function intensityBandLabel(band: IntensityBandPresentation["band"]) {
  const labels: Record<IntensityBandPresentation["band"], string> = {
    recovery: "Recovery",
    endurance: "Endurance",
    tempo: "Tempo",
    threshold: "Threshold",
    vo2max: "VO₂ max",
    anaerobic: "Anaerobic",
    neuromuscular: "Neuromuscular",
  };
  return labels[band];
}

function buildIntensity(ledger: PlanningLedger): PlanningLedgerPresentation["intensity"] {
  const bands = ledger.intensityDistribution.bands
    .filter((band) => band.percentage > 0 || band.durationSeconds > 0)
    .map((band) => ({
      band: band.band,
      durationLabel: formatDurationSeconds(band.durationSeconds),
      label: intensityBandLabel(band.band),
      percentage: band.percentage,
      percentageLabel: `${formatNumber(band.percentage)}%`,
    }));
  const durationLabel = formatDurationSeconds(
    ledger.intensityDistribution.contributingDurationSeconds,
  );
  return {
    bands,
    durationLabel,
    summary: bands.length
      ? `Intensity distribution across ${durationLabel}: ${bands.map((band) => `${band.label} ${band.percentageLabel}`).join(", ")}.`
      : "Intensity distribution is unavailable for this period.",
  };
}

function sourceWindow(
  source: PlanningLedger["sourceCoverage"]["activities"],
  fallback = "Unavailable",
) {
  return source
    ? `${formatLedgerDate(source.startDate)} – ${formatLedgerDate(source.endDate)}`
    : fallback;
}

export function buildPlanningLedgerPresentation(
  ledger: PlanningLedger,
  trainingComposition?: TrainingComposition | null,
): PlanningLedgerPresentation {
  const completed = metricNumber(ledger.load.completed);
  const planned = metricNumber(ledger.load.planned);
  const progress =
    completed !== null && planned !== null && planned > 0 ? completed / planned : null;
  const progressPercent = progress === null ? null : Math.round(progress * 100);
  const varianceLabel =
    completed !== null && planned !== null
      ? `${completed >= planned ? "+" : ""}${formatNumber(completed - planned)} vs plan`
      : null;
  return {
    days: buildDays(ledger),
    diagnostics: {
      asOfLabel: formatAsOf(ledger.asOf, ledger.planningTimezone),
      entriesTruncated: ledger.entriesTruncated,
      modelLines: [
        `Common load: ${ledger.modelContext.commonLoadModel} v${ledger.modelContext.commonLoadVersion}`,
        `Published revision: ${ledger.modelContext.publishedRevision ?? "Unavailable"}`,
        `Algorithm: ${ledger.modelContext.algorithmVersion ?? "Unavailable"}`,
      ],
      planningTimezone: ledger.planningTimezone ?? "Unavailable",
      sourceWindows: [
        {
          key: "activities",
          label: "Completed activities",
          value: sourceWindow(ledger.sourceCoverage.activities),
        },
        {
          key: "scheduled",
          label: "Scheduled items",
          value: sourceWindow(ledger.sourceCoverage.scheduledItems),
        },
        {
          key: "calendar",
          label: "Calendar events",
          value: sourceWindow(ledger.sourceCoverage.calendarEvents),
        },
        {
          key: "groups",
          label: "Group events",
          value: sourceWindow(ledger.sourceCoverage.groupEvents),
        },
      ],
    },
    durationComposition: buildDurationCompositionPresentation(trainingComposition),
    intensity: buildIntensity(ledger),
    load: {
      completed,
      completedLabel: formatLoadMetric(ledger.load.completed),
      planned,
      plannedLabel: formatLoadMetric(ledger.load.planned),
      progressPercent,
      title: loadPosition(completed, planned),
      varianceLabel,
    },
    periodLabel:
      ledger.period === "day"
        ? formatLedgerDate(ledger.periodStart)
        : `${formatLedgerDate(ledger.periodStart)} – ${formatLedgerDate(ledger.periodEnd)}`,
    state: buildState(ledger),
  };
}
