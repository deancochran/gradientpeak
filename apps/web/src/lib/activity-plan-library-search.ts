import {
  type ActivityPlanPreparationContext,
  parseActivityPlanPreparationContext,
} from "./coaching/activity-plan-preparation-context";

const activityPlanCategories = ["run", "bike", "swim", "strength", "other"] as const;

export type ActivityPlanCategory = (typeof activityPlanCategories)[number];

export type ActivityPlanLibrarySearch = Partial<ActivityPlanPreparationContext> & {
  activity_category?: ActivityPlanCategory;
  q?: string;
};

/** Validated library context that can follow an activity plan into and back out of its detail route. */
export function activityPlanLibrarySearch(
  search: Record<string, unknown>,
): ActivityPlanLibrarySearch {
  const preparation = parseActivityPlanPreparationContext(search);
  const activity_category = activityPlanCategories.includes(
    search.activity_category as ActivityPlanCategory,
  )
    ? (search.activity_category as ActivityPlanCategory)
    : undefined;
  const q = typeof search.q === "string" && search.q ? search.q.slice(0, 100) : undefined;

  return {
    ...(preparation ?? {}),
    ...(activity_category ? { activity_category } : {}),
    ...(q ? { q } : {}),
  };
}
