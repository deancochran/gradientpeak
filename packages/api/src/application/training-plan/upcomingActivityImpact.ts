export type UpcomingActivityImpact = {
  activity_plan_id: string;
  title: string;
  scheduled_at: string;
  sport: string;
  estimated_load: number | null;
  short_term_readiness_delta: number | null;
  fitness_contribution: number | null;
  confidence: "high" | "medium" | "low";
  explanation: string;
};

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
    .slice(0, 5)
    .map((planned) => {
      const plan = planned.activity_plan ?? {};
      const planId = plan.id ?? planned.id ?? planned.starts_at;
      const scheduledDate = planned.scheduled_date ?? String(planned.starts_at ?? "").slice(0, 10);
      const estimatedLoadRaw = plan.id ? Number(input.estimatedTssByPlanId.get(plan.id) || 0) : 0;
      const estimatedLoad =
        Number.isFinite(estimatedLoadRaw) && estimatedLoadRaw > 0 ? estimatedLoadRaw : null;
      const recommendedLoad = input.recommendedByDate.get(scheduledDate) ?? 0;
      const loadDelta = estimatedLoad === null ? null : estimatedLoad - recommendedLoad;
      const readinessDelta =
        loadDelta === null
          ? null
          : Math.round(Math.max(-12, Math.min(8, -loadDelta / 12)) * 10) / 10;
      const fitnessContribution =
        estimatedLoad === null ? null : Math.round(Math.min(12, estimatedLoad / 12) * 10) / 10;
      const title = plan.name ?? plan.title ?? planned.title ?? "Scheduled session";
      const sport = plan.activity_category ?? plan.sport ?? plan.type ?? "training";

      return {
        activity_plan_id: String(planId),
        title: String(title),
        scheduled_at: String(planned.starts_at ?? `${scheduledDate}T00:00:00.000Z`),
        sport: String(sport),
        estimated_load: estimatedLoad === null ? null : Math.round(estimatedLoad * 10) / 10,
        short_term_readiness_delta: readinessDelta,
        fitness_contribution: fitnessContribution,
        confidence: estimatedLoad === null ? "low" : "medium",
        explanation:
          estimatedLoad === null
            ? "Add duration and intensity to estimate this session's readiness impact."
            : loadDelta !== null && loadDelta > 15
              ? "This session is above the recommended daily load and may reduce short-term readiness."
              : "This session contributes fitness while staying close to the recommended load path.",
      };
    });
}
