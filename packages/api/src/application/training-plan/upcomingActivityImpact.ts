import { activityPlanStructureSchemaV3 } from "@repo/core/activity-plan";
import type { CanonicalActivityCategory } from "@repo/core/schemas/activity-category";

export type UpcomingActivityImpact = {
  activity_plan_id: string;
  title: string;
  scheduled_at: string;
  activity_category: CanonicalActivityCategory;
  estimated_load: number | null;
  short_term_readiness_delta: number | null;
  fitness_contribution: number | null;
  confidence: "high" | "medium" | "low";
  explanation: string;
};

function readCanonicalPlanActivityCategory(plan: unknown): CanonicalActivityCategory | null {
  if (!plan || typeof plan !== "object") return null;
  const parsed = activityPlanStructureSchemaV3.safeParse(
    (plan as { structure?: unknown }).structure,
  );
  if (!parsed.success) return null;
  return (
    parsed.data.segments.find((segment) => segment.role === "activity")?.activity_category ?? null
  );
}

export function buildUpcomingActivityImpact(input: {
  plannedActivities: any[];
  estimatedTssByPlanId: Map<unknown, unknown>;
  today: string;
  horizonEnd: string;
  recommendedByDate: Map<string, number>;
}): UpcomingActivityImpact[] {
  return (input.plannedActivities ?? [])
    .filter((planned) => {
      const scheduledDate = planned.scheduled_date;
      return scheduledDate >= input.today && scheduledDate <= input.horizonEnd;
    })
    .sort((left, right) =>
      String(left.starts_at ?? "").localeCompare(String(right.starts_at ?? "")),
    )
    .flatMap((planned): UpcomingActivityImpact[] => {
      const plan = planned.activity_plan ?? {};
      const activity_category = readCanonicalPlanActivityCategory(plan);
      if (!activity_category) return [];
      const planId = plan.id ?? planned.id ?? planned.starts_at;
      const scheduledDate = planned.scheduled_date;
      const estimatedLoadRaw = plan.id ? Number(input.estimatedTssByPlanId.get(plan.id) || 0) : 0;
      const estimatedLoad =
        Number.isFinite(estimatedLoadRaw) && estimatedLoadRaw > 0 ? estimatedLoadRaw : null;
      const recommendedLoad = input.recommendedByDate.get(scheduledDate) ?? 0;
      const loadDelta = estimatedLoad === null ? null : estimatedLoad - recommendedLoad;
      const title = plan.name ?? plan.title ?? planned.title ?? "Scheduled session";

      return [
        {
          activity_plan_id: String(planId),
          title: String(title),
          scheduled_at: String(planned.starts_at ?? `${scheduledDate}T00:00:00.000Z`),
          activity_category,
          estimated_load: estimatedLoad === null ? null : Math.round(estimatedLoad * 10) / 10,
          // These fields remain in the DTO for compatibility, but planned load does not
          // provide enough evidence to infer physiological readiness or fitness effects.
          short_term_readiness_delta: null,
          fitness_contribution: null,
          confidence: estimatedLoad === null ? "low" : "medium",
          explanation:
            estimatedLoad === null
              ? "Add duration and intensity to compare this session's planned load with the recommended daily load."
              : loadDelta !== null && loadDelta > 15
                ? "This session's planned load is above the recommended daily load."
                : loadDelta !== null && loadDelta < -15
                  ? "This session's planned load is below the recommended daily load."
                  : "This session's planned load is close to the recommended daily load.",
        },
      ];
    })
    .slice(0, 5);
}
