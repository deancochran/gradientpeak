import type { ActivityPlanMetric } from "@repo/core";
import { describe, expect, it } from "vitest";
import { createActivityPlanSummary } from "@/test/activity-plan-projection-fixture";
import {
  buildDiscoverFeedItems,
  DEFAULT_ACTIVITY_PLAN_FILTERS,
  DEFAULT_PROFILE_SORT,
  DEFAULT_ROUTE_SORT,
  DEFAULT_TRAINING_PLAN_SORT,
  matchesActivityPlanDerivedFilters,
} from "./index";

function activityPlan(id: string, objectiveIntensity: number | null) {
  const objectiveMetric: ActivityPlanMetric =
    objectiveIntensity === null
      ? {
          key: "objective_intensity",
          label: "Intensity",
          status: "unavailable",
          value: null,
          unit: "ratio",
          reason: "no_objective_targets",
          provenance: null,
        }
      : {
          key: "objective_intensity",
          label: "Intensity",
          status: "available",
          value: objectiveIntensity,
          unit: "ratio",
          reason: null,
          provenance: "estimated",
        };
  return createActivityPlanSummary({
    id,
    href: `/activity-plans/${id}`,
    metrics: [
      {
        key: "distance",
        label: "Distance",
        status: "unavailable",
        value: null,
        unit: "meters",
        reason: "not_prescribed",
        provenance: null,
      },
      {
        key: "elapsed_duration",
        label: "Duration",
        status: "unavailable",
        value: null,
        unit: "seconds",
        reason: "not_prescribed",
        provenance: null,
      },
      {
        key: "common_load",
        label: "Load",
        status: "unavailable",
        value: null,
        unit: "score",
        reason: "no_load_data",
        provenance: null,
      },
      objectiveMetric,
    ],
  });
}

describe("activity-plan discovery objective intensity", () => {
  it("filters only by the canonical objective ratio", () => {
    const filters = {
      ...DEFAULT_ACTIVITY_PLAN_FILTERS,
      minObjectiveIntensity: 0.7,
    };

    expect(matchesActivityPlanDerivedFilters(activityPlan("objective", 0.75), filters)).toBe(true);
    expect(matchesActivityPlanDerivedFilters(activityPlan("unavailable", null), filters)).toBe(
      false,
    );
  });

  it("sorts activity plans by objective intensity without a normalized fallback", () => {
    const items = buildDiscoverFeedItems({
      activeScope: "activityPlans",
      activityPlans: [
        activityPlan("unavailable", null),
        activityPlan("high", 0.8),
        activityPlan("low", 0.6),
      ],
      activityPlanFilters: DEFAULT_ACTIVITY_PLAN_FILTERS,
      activityPlanSort: { field: "objective_intensity", direction: "desc" },
      groupsList: [],
      hasSearchQuery: false,
      normalizedSearchQuery: "",
      profileSort: DEFAULT_PROFILE_SORT,
      routeSort: DEFAULT_ROUTE_SORT,
      routes: [],
      trainingPlanSort: DEFAULT_TRAINING_PLAN_SORT,
      trainingPlans: [],
      users: [],
    });

    expect(items.map((item) => item.id)).toEqual([
      "activityPlans-high",
      "activityPlans-low",
      "activityPlans-unavailable",
    ]);
  });
});
