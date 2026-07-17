import type {
  CompiledActivityPlan,
  CompiledActivityPlanOccurrence,
  CompiledActivityStepOccurrence,
} from "./activity-plan";
import { type ActivityPlanDurationSummary, summarizeActivityPlanDuration } from "./duration";
import type { CanonicalSport } from "./schemas/sport";

export type ActivityProfilePoint = {
  occurrenceId: string;
  globalOrdinal: number;
  segmentId: string;
  segmentIndex: number;
  category: CanonicalSport | null;
  role: CompiledActivityPlanOccurrence["role"];
  durationSeconds: number | null;
  cumulativeExactSeconds: number | null;
  targets: CompiledActivityPlanOccurrence["targets"];
};

export type ActivityCategoryDose = {
  category: CanonicalSport;
  occurrenceCount: number;
  timedActiveSeconds: number;
  distanceMeters: number;
  repetitionCount: number;
  openOccurrenceCount: number;
  /** Cycling-only power evidence. Never combines target domains or sports. */
  cyclingPower?: {
    averageFtpPercent: number;
    maximumFtpPercent: number;
    highIntensityOccurrenceCount: number;
    evidenceSeconds: number;
    eligibleTimedSeconds: number;
    evidenceCoverage: number;
    complete: boolean;
    /** Stress for evidence-covered occurrences only; not a complete category load unless `complete`. */
    estimatedTss: number;
  };
};

export type ActivityPlanStats = {
  occurrenceCount: number;
  duration: ActivityPlanDurationSummary;
  categoryDoses: ActivityCategoryDose[];
};

/** Creates visualization points without assigning guessed time to non-time completion policies. */
export function extractActivityProfile(plan: CompiledActivityPlan): ActivityProfilePoint[] {
  let cumulativeExactSeconds: number | null = 0;
  return plan.occurrences.map((occurrence) => {
    const durationSeconds =
      occurrence.duration.type === "time" ? occurrence.duration.seconds : null;
    const point: ActivityProfilePoint = {
      occurrenceId: occurrence.occurrenceId,
      globalOrdinal: occurrence.globalOrdinal,
      segmentId: occurrence.segmentId,
      segmentIndex: occurrence.segmentIndex,
      category: occurrence.category,
      role: occurrence.role,
      durationSeconds,
      cumulativeExactSeconds,
      targets: occurrence.targets,
    };
    cumulativeExactSeconds =
      cumulativeExactSeconds !== null && durationSeconds !== null
        ? cumulativeExactSeconds + durationSeconds
        : null;
    return point;
  });
}

/** Calculates sport-isolated dose; only cycling power has supported load evidence here. */
export function calculateActivityPlanStats(
  plan: CompiledActivityPlan,
  options?: { cyclingFtpWatts?: number },
): ActivityPlanStats {
  const duration = summarizeActivityPlanDuration(plan);
  const occurrencesByCategory = new Map<CanonicalSport, CompiledActivityStepOccurrence[]>();
  for (const occurrence of plan.occurrences) {
    if (occurrence.role !== "activity") continue;
    const categoryOccurrences = occurrencesByCategory.get(occurrence.category) ?? [];
    categoryOccurrences.push(occurrence);
    occurrencesByCategory.set(occurrence.category, categoryOccurrences);
  }

  const categoryDoses = duration.categories.map<ActivityCategoryDose>((categoryDuration) => {
    const occurrences = occurrencesByCategory.get(categoryDuration.category) ?? [];
    const dose: ActivityCategoryDose = {
      ...categoryDuration,
      occurrenceCount: occurrences.length,
    };
    if (categoryDuration.category !== "bike") return dose;

    let weightedFtpPercent = 0;
    let evidenceSeconds = 0;
    const eligibleTimedSeconds = occurrences.reduce(
      (total, occurrence) =>
        total + (occurrence.duration.type === "time" ? occurrence.duration.seconds : 0),
      0,
    );
    let maximumFtpPercent = 0;
    let highIntensityOccurrenceCount = 0;
    let estimatedTss = 0;
    for (const occurrence of occurrences) {
      if (occurrence.duration.type !== "time") continue;
      const target = occurrence.targets.find(
        (candidate) => candidate.type === "%FTP" || candidate.type === "watts",
      );
      if (!target) continue;
      const ftpPercent =
        target.type === "%FTP"
          ? target.intensity
          : options?.cyclingFtpWatts
            ? (target.intensity / options.cyclingFtpWatts) * 100
            : null;
      if (ftpPercent === null) continue;
      weightedFtpPercent += ftpPercent * occurrence.duration.seconds;
      evidenceSeconds += occurrence.duration.seconds;
      estimatedTss += (occurrence.duration.seconds / 3600) * (ftpPercent / 100) ** 2 * 100;
      maximumFtpPercent = Math.max(maximumFtpPercent, ftpPercent);
      if (ftpPercent > 85) highIntensityOccurrenceCount += 1;
    }
    if (evidenceSeconds > 0) {
      const averageFtpPercent = weightedFtpPercent / evidenceSeconds;
      dose.cyclingPower = {
        averageFtpPercent,
        maximumFtpPercent,
        highIntensityOccurrenceCount,
        evidenceSeconds,
        eligibleTimedSeconds,
        evidenceCoverage: eligibleTimedSeconds > 0 ? evidenceSeconds / eligibleTimedSeconds : 0,
        complete:
          evidenceSeconds === eligibleTimedSeconds &&
          categoryDuration.distanceMeters === 0 &&
          categoryDuration.repetitionCount === 0 &&
          categoryDuration.openOccurrenceCount === 0,
        estimatedTss: Math.round(estimatedTss * 10_000) / 10_000,
      };
    }
    return dose;
  });

  return { occurrenceCount: plan.occurrences.length, duration, categoryDoses };
}

/** Resolves only within the exact timed prefix; unknown-duration occurrences are an explicit boundary. */
export function getOccurrenceAtElapsedTime(
  plan: CompiledActivityPlan,
  elapsedSeconds: number,
): { occurrence: CompiledActivityPlanOccurrence; elapsedSeconds: number; progress: number } | null {
  let cumulativeSeconds = 0;
  for (const occurrence of plan.occurrences) {
    if (occurrence.duration.type !== "time") return null;
    if (elapsedSeconds < cumulativeSeconds + occurrence.duration.seconds) {
      const elapsed = elapsedSeconds - cumulativeSeconds;
      return {
        occurrence,
        elapsedSeconds: elapsed,
        progress: elapsed / occurrence.duration.seconds,
      };
    }
    cumulativeSeconds += occurrence.duration.seconds;
  }
  return null;
}
