import type { CanonicalGoalActivityCategory } from "../schemas";
import { parseHmsToSeconds, parseMmSsToSeconds } from "../utils/fitness-inputs";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parseDateOnly(value: string | undefined): string | undefined {
  if (!value || !DATE_ONLY_PATTERN.test(value)) {
    return undefined;
  }
  return value;
}

export function parseDistanceKmToMeters(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 1000);
}

export function parseGoalDurationSeconds(value: string | undefined): number | null {
  return parseHmsToSeconds(value) ?? parseMmSsToSeconds(value) ?? null;
}

export function parseGoalPaceSpeed(value: string | undefined): number | null {
  const paceSeconds = parseMmSsToSeconds(value);
  if (!paceSeconds || paceSeconds <= 0) return null;
  return 1000 / paceSeconds;
}

export function normalizeGoalActivityCategory(
  goalType: string,
  activityCategory: CanonicalGoalActivityCategory,
): CanonicalGoalActivityCategory {
  if (goalType === "pace_threshold") return "run";
  if (goalType === "power_threshold") return "bike";
  return activityCategory;
}
