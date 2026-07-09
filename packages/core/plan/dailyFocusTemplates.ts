import type { DailyRecommendedLoadPrimaryFocus } from "./dailyRecommendedLoad";

export interface DailyFocusTemplateDay {
  date: string;
  dayOffset: number;
}

export interface DailyFocusRecoveryRange {
  startDate: string;
  endDate: string;
}

export interface ResolveDailyFocusTemplateInput {
  phase?: string | null;
  selectedDays: DailyFocusTemplateDay[];
  eventDate?: string | null;
  recoveryRanges?: DailyFocusRecoveryRange[] | null;
}

type DailyFocusTemplatePhase = "build" | "deload" | "recovery" | "taper" | "event";

const BUILD_TEMPLATES: Record<number, DailyRecommendedLoadPrimaryFocus[]> = {
  1: ["endurance"],
  2: ["tempo", "long_endurance"],
  3: ["endurance", "threshold", "long_endurance"],
  4: ["endurance", "tempo", "recovery", "long_endurance"],
  5: ["endurance", "tempo", "recovery", "threshold", "long_endurance"],
  6: ["endurance", "tempo", "recovery", "endurance", "threshold", "long_endurance"],
  7: ["endurance", "tempo", "recovery", "endurance", "threshold", "recovery", "long_endurance"],
};

const DELOAD_TEMPLATES: Record<number, DailyRecommendedLoadPrimaryFocus[]> = {
  1: ["recovery"],
  2: ["recovery", "endurance"],
  3: ["recovery", "endurance", "mobility"],
  4: ["recovery", "endurance", "mobility", "recovery"],
  5: ["recovery", "endurance", "mobility", "endurance", "recovery"],
  6: ["recovery", "endurance", "mobility", "recovery", "endurance", "mobility"],
  7: ["recovery", "endurance", "mobility", "recovery", "endurance", "mobility", "recovery"],
};

const TAPER_TEMPLATES: Record<number, DailyRecommendedLoadPrimaryFocus[]> = {
  1: ["tempo"],
  2: ["tempo", "recovery"],
  3: ["tempo", "endurance", "recovery"],
  4: ["tempo", "recovery", "endurance", "recovery"],
  5: ["tempo", "recovery", "endurance", "mobility", "recovery"],
  6: ["tempo", "recovery", "endurance", "mobility", "endurance", "recovery"],
  7: ["tempo", "recovery", "endurance", "mobility", "endurance", "mobility", "recovery"],
};

const HARD_FOCUSES = new Set<DailyRecommendedLoadPrimaryFocus>([
  "tempo",
  "threshold",
  "vo2",
  "anaerobic",
  "race_specific",
]);

function clampSessionCount(count: number): number {
  return Math.max(1, Math.min(7, count));
}

function normalizeTemplatePhase(phase: string | null | undefined): DailyFocusTemplatePhase {
  const normalized = phase?.toLowerCase() ?? "";
  if (normalized.includes("event") || normalized.includes("race")) return "event";
  if (normalized.includes("taper")) return "taper";
  if (normalized.includes("deload")) return "deload";
  if (normalized.includes("recovery")) return "recovery";
  return "build";
}

function baseTemplateForPhase(
  phase: DailyFocusTemplatePhase,
  selectedCount: number,
): DailyRecommendedLoadPrimaryFocus[] {
  const count = clampSessionCount(selectedCount);
  if (phase === "deload" || phase === "recovery") return DELOAD_TEMPLATES[count] ?? ["recovery"];
  if (phase === "taper" || phase === "event") return TAPER_TEMPLATES[count] ?? ["tempo"];
  return BUILD_TEMPLATES[count] ?? ["endurance"];
}

function isHardFocus(focus: DailyRecommendedLoadPrimaryFocus): boolean {
  return HARD_FOCUSES.has(focus);
}

function degradedFocus(focus: DailyRecommendedLoadPrimaryFocus): DailyRecommendedLoadPrimaryFocus {
  if (
    focus === "race_specific" ||
    focus === "threshold" ||
    focus === "vo2" ||
    focus === "anaerobic"
  ) {
    return "tempo";
  }
  if (focus === "tempo") return "endurance";
  return focus;
}

function isInRecoveryRange(date: string, ranges: DailyFocusRecoveryRange[] | null | undefined) {
  return (ranges ?? []).some((range) => date >= range.startDate && date <= range.endDate);
}

function applyEventAndRecoveryOverrides(input: {
  days: DailyFocusTemplateDay[];
  focuses: DailyRecommendedLoadPrimaryFocus[];
  eventDate?: string | null;
  recoveryRanges?: DailyFocusRecoveryRange[] | null;
}) {
  return input.focuses.map((focus, index) => {
    const day = input.days[index];
    if (!day) return focus;

    if (input.eventDate && day.date === input.eventDate) return "race_specific";
    if (input.eventDate && day.date > input.eventDate)
      return day.dayOffset === 6 ? "mobility" : "recovery";
    if (isInRecoveryRange(day.date, input.recoveryRanges))
      return index % 2 === 0 ? "recovery" : "mobility";

    return focus;
  });
}

function applyHardSpacing(input: {
  days: DailyFocusTemplateDay[];
  focuses: DailyRecommendedLoadPrimaryFocus[];
  protectedHardDates: Set<string>;
}) {
  const resolved = [...input.focuses];

  for (let index = 1; index < input.days.length; index += 1) {
    const currentDay = input.days[index];
    const previousDay = input.days[index - 1];
    if (!currentDay || !previousDay) continue;
    if (currentDay.dayOffset - previousDay.dayOffset !== 1) continue;
    if (
      !isHardFocus(resolved[index] ?? "recovery") ||
      !isHardFocus(resolved[index - 1] ?? "recovery")
    ) {
      continue;
    }

    if (input.protectedHardDates.has(currentDay.date)) {
      resolved[index - 1] = degradedFocus(resolved[index - 1] ?? "recovery");
    } else {
      let nextFocus = resolved[index] ?? "recovery";
      while (isHardFocus(nextFocus)) {
        const degraded = degradedFocus(nextFocus);
        if (degraded === nextFocus) break;
        nextFocus = degraded;
      }
      resolved[index] = nextFocus;
    }
  }

  return resolved;
}

export function resolveDailyFocusTemplate(
  input: ResolveDailyFocusTemplateInput,
): DailyRecommendedLoadPrimaryFocus[] {
  if (input.selectedDays.length === 0) return [];

  const phase = normalizeTemplatePhase(input.phase);
  const baseFocuses = baseTemplateForPhase(phase, input.selectedDays.length).slice(
    0,
    input.selectedDays.length,
  );
  const eventFocuses = applyEventAndRecoveryOverrides({
    days: input.selectedDays,
    focuses: baseFocuses,
    eventDate: input.eventDate,
    recoveryRanges: input.recoveryRanges,
  });

  return applyHardSpacing({
    days: input.selectedDays,
    focuses: eventFocuses,
    protectedHardDates: new Set(input.eventDate ? [input.eventDate] : []),
  });
}
