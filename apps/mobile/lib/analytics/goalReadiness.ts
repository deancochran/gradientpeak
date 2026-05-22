type GoalReadinessTargetPayload = {
  distance_m?: number | null;
  target_time_s?: number | null;
  activity_category?: string | null;
};

type GoalReadinessInput = {
  activity_category?: string | null;
  priority?: number | null;
  target_date?: string | null;
  target_payload?: unknown;
  objective?: unknown;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function daysUntil(targetDate: string | null | undefined, todayKey: string) {
  if (!targetDate) return 0;
  const target = Date.parse(`${targetDate}T12:00:00.000Z`);
  const today = Date.parse(`${todayKey}T12:00:00.000Z`);
  if (Number.isNaN(target) || Number.isNaN(today)) return 0;
  return Math.max(0, Math.ceil((target - today) / 86_400_000));
}

function toTargetPayload(value: unknown): GoalReadinessTargetPayload | null {
  if (!value || typeof value !== "object") return null;

  return {
    distance_m:
      "distance_m" in value && typeof value.distance_m === "number" ? value.distance_m : null,
    target_time_s:
      "target_time_s" in value && typeof value.target_time_s === "number"
        ? value.target_time_s
        : null,
    activity_category:
      "activity_category" in value && typeof value.activity_category === "string"
        ? value.activity_category
        : null,
  };
}

function getTargetPayload(goal: GoalReadinessInput): GoalReadinessTargetPayload | null {
  return toTargetPayload(goal.target_payload) ?? toTargetPayload(goal.objective);
}

function getRunPaceBaselineKph(distanceKm: number) {
  if (distanceKm >= 42) return 10.5;
  if (distanceKm >= 21) return 11.5;
  if (distanceKm >= 10) return 12;
  return 12.5;
}

export function resolveGoalSpecificFallbackReadiness(input: {
  goal: GoalReadinessInput;
  currentReadiness: number | null | undefined;
  todayKey: string;
}) {
  const payload = getTargetPayload(input.goal);
  const base =
    typeof input.currentReadiness === "number" && Number.isFinite(input.currentReadiness)
      ? input.currentReadiness
      : 50;
  const distanceKm =
    typeof payload?.distance_m === "number" && Number.isFinite(payload.distance_m)
      ? payload.distance_m / 1000
      : null;
  const targetTimeSeconds =
    typeof payload?.target_time_s === "number" && Number.isFinite(payload.target_time_s)
      ? payload.target_time_s
      : null;
  const activityCategory = payload?.activity_category ?? input.goal.activity_category ?? null;
  const horizonDays = daysUntil(input.goal.target_date, input.todayKey);
  const horizonCredit = clamp(horizonDays / 180, 0, 1) * 14;
  const priorityPenalty = clamp(((input.goal.priority ?? 5) - 5) * 0.7, 0, 4);

  let distancePenalty = 0;
  let pacePenalty = 0;
  if (distanceKm !== null) {
    const normalizedDistanceKm = activityCategory === "bike" ? distanceKm * 0.28 : distanceKm;
    distancePenalty = clamp((normalizedDistanceKm - 5) / 37.2, 0, 1) * 28;

    if (targetTimeSeconds !== null && targetTimeSeconds > 0) {
      const speedKph = (distanceKm * 3600) / targetTimeSeconds;
      const paceBaseline = getRunPaceBaselineKph(normalizedDistanceKm);
      pacePenalty = clamp(speedKph - paceBaseline, 0, 4) * 4;
    }
  }

  return Math.round(
    clamp(base - distancePenalty - pacePenalty - priorityPenalty + horizonCredit, 0, 100),
  );
}
