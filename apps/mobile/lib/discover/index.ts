import type { ActivityPlanSummary } from "@repo/core";
import { getActivityPlanQuantitySummary } from "@/lib/activityPlanMetrics";
import type { GroupListItem } from "@/lib/groups";

export const SEARCH_QUERY_MAX_LENGTH = 80;

export const ACTIVITY_CATEGORY_OPTIONS = [
  { id: "run", label: "Running" },
  { id: "bike", label: "Cycling" },
  { id: "swim", label: "Swimming" },
  { id: "strength", label: "Strength" },
  { id: "other", label: "Other" },
] as const;

export const TRAINING_PLAN_ACTIVITY_CATEGORY_OPTIONS = [
  { id: "run", label: "Running" },
  { id: "bike", label: "Cycling" },
  { id: "swim", label: "Swimming" },
  { id: "strength", label: "Strength" },
  { id: "other", label: "Other" },
] as const;

export const TRAINING_PLAN_EXPERIENCE_OPTIONS = [
  { id: "beginner", label: "Beginner" },
  { id: "intermediate", label: "Intermediate" },
  { id: "advanced", label: "Advanced" },
] as const;

export const SCOPE_OPTIONS = [
  { id: "activityPlans", label: "Activity Plans" },
  { id: "routes", label: "Routes" },
  { id: "trainingPlans", label: "Training Plans" },
  { id: "groups", label: "Groups" },
  { id: "users", label: "Profiles" },
] as const;

export type TabType = "activityPlans" | "trainingPlans" | "routes" | "groups" | "users";
export type DiscoverScope = TabType;
export type DiscoverCategoryId = (typeof ACTIVITY_CATEGORY_OPTIONS)[number]["id"];
export type SortDirection = "asc" | "desc";
export type ActivityPlanSortField =
  | "created_at"
  | "estimated_duration"
  | "common_load"
  | "objective_intensity";
export type RouteSortField = "created_at" | "distance" | "ascent";
export type TrainingPlanSortField = "created_at" | "duration_weeks" | "sessions_per_week";
export type GroupSortField = "created_at";
export type ProfileSortField = "created_at" | "username";

export type ActivityPlanFilters = {
  categoryIds: DiscoverCategoryId[];
  minCommonLoad: number | null;
  maxCommonLoad: number | null;
  minDurationMinutes: number | null;
  maxDurationMinutes: number | null;
  minObjectiveIntensity: number | null;
  maxObjectiveIntensity: number | null;
};

export type TrainingPlanFilters = {
  activity_category: DiscoverCategoryId | null;
  experienceLevel: "beginner" | "intermediate" | "advanced" | null;
  minWeeks: number | null;
  maxWeeks: number | null;
  minSessionsPerWeek: number | null;
  maxSessionsPerWeek: number | null;
};

export type RouteFilters = {
  minDistanceKm: number | null;
  maxDistanceKm: number | null;
  minAscentM: number | null;
  maxAscentM: number | null;
};

export type SortState<TField extends string> = {
  field: TField;
  direction: SortDirection;
};

export type DiscoverActivityPlanItem = ActivityPlanSummary;

export type DiscoverTrainingPlanItem = {
  id: string;
  name: string;
  description?: string | null;
  activity_category?: string[] | string | null;
  experienceLevel?: string[] | string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type DiscoverRouteItem = {
  id: string;
  name: string;
  description?: string | null;
  activity_category?: string | null;
  total_distance?: number | null;
  distance?: number | null;
  total_ascent?: number | null;
  ascent?: number | null;
  created_at?: string | Date | null;
  updated_at?: string | Date | null;
};

export type DiscoverUserItem = {
  id: string;
  username?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  follow_status: "pending" | "accepted" | null;
  is_public?: boolean | null;
  created_at?: string | Date | null;
  updated_at?: string | Date | null;
};

export type DiscoverGroupItem = GroupListItem & {
  created_at?: string | Date | null;
  updated_at?: string | Date | null;
};

type FeedItemBase<TType extends TabType, TItem> = {
  id: string;
  type: TType;
  item: TItem;
  sortDate: string | null;
  score: number;
};

export type DiscoverFeedItem =
  | FeedItemBase<"activityPlans", DiscoverActivityPlanItem>
  | FeedItemBase<"trainingPlans", DiscoverTrainingPlanItem>
  | FeedItemBase<"routes", DiscoverRouteItem>
  | FeedItemBase<"groups", DiscoverGroupItem>
  | FeedItemBase<"users", DiscoverUserItem>;

export const DEFAULT_ACTIVITY_PLAN_FILTERS: ActivityPlanFilters = {
  categoryIds: [],
  minCommonLoad: null,
  maxCommonLoad: null,
  minDurationMinutes: null,
  maxDurationMinutes: null,
  minObjectiveIntensity: null,
  maxObjectiveIntensity: null,
};

export const DEFAULT_TRAINING_PLAN_FILTERS: TrainingPlanFilters = {
  activity_category: null,
  experienceLevel: null,
  minWeeks: null,
  maxWeeks: null,
  minSessionsPerWeek: null,
  maxSessionsPerWeek: null,
};

export const DEFAULT_ROUTE_FILTERS: RouteFilters = {
  minDistanceKm: null,
  maxDistanceKm: null,
  minAscentM: null,
  maxAscentM: null,
};

export const DEFAULT_ACTIVITY_PLAN_SORT: SortState<ActivityPlanSortField> = {
  field: "created_at",
  direction: "desc",
};

export const DEFAULT_ROUTE_SORT: SortState<RouteSortField> = {
  field: "created_at",
  direction: "desc",
};

export const DEFAULT_TRAINING_PLAN_SORT: SortState<TrainingPlanSortField> = {
  field: "created_at",
  direction: "desc",
};

export const DEFAULT_GROUP_SORT: SortState<GroupSortField> = {
  field: "created_at",
  direction: "desc",
};

export const DEFAULT_PROFILE_SORT: SortState<ProfileSortField> = {
  field: "created_at",
  direction: "desc",
};

export function hasActivityPlanFilters(filters: ActivityPlanFilters) {
  return Boolean(
    filters.categoryIds.length > 0 ||
      filters.minCommonLoad !== null ||
      filters.maxCommonLoad !== null ||
      filters.minDurationMinutes !== null ||
      filters.maxDurationMinutes !== null ||
      filters.minObjectiveIntensity !== null ||
      filters.maxObjectiveIntensity !== null,
  );
}

export function hasTrainingPlanFilters(filters: TrainingPlanFilters) {
  return Boolean(
    filters.activity_category ||
      filters.experienceLevel ||
      filters.minWeeks !== null ||
      filters.maxWeeks !== null ||
      filters.minSessionsPerWeek !== null ||
      filters.maxSessionsPerWeek !== null,
  );
}

export function hasRouteFilters(filters: RouteFilters) {
  return Boolean(
    filters.minDistanceKm !== null ||
      filters.maxDistanceKm !== null ||
      filters.minAscentM !== null ||
      filters.maxAscentM !== null,
  );
}

export function normalizeSearchValue(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export function sanitizeSearchInput(value: string) {
  return value.replace(/\s+/g, " ").slice(0, SEARCH_QUERY_MAX_LENGTH);
}

export function parseNumericInput(value: string, options?: { allowDecimal?: boolean }) {
  const sanitized = options?.allowDecimal
    ? value.replace(/[^0-9.]/g, "")
    : value.replace(/[^0-9]/g, "");
  if (!sanitized) {
    return null;
  }

  const parsed = options?.allowDecimal
    ? Number.parseFloat(sanitized)
    : Number.parseInt(sanitized, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getSearchPlaceholder(scope: DiscoverScope) {
  switch (scope) {
    case "activityPlans":
      return "Search activity plans";
    case "routes":
      return "Search routes";
    case "trainingPlans":
      return "Search training plans";
    case "groups":
      return "Search groups";
    case "users":
      return "Search profiles";
  }
}

export function getScopeNoun(scope: DiscoverScope) {
  switch (scope) {
    case "activityPlans":
      return "activity plans";
    case "routes":
      return "routes";
    case "trainingPlans":
      return "training plans";
    case "groups":
      return "groups";
    case "users":
      return "profiles";
  }
}

function scoreSearchTextMatch(query: string, value: string | null | undefined) {
  const normalizedValue = normalizeSearchValue(value);
  if (!query || !normalizedValue) {
    return 0;
  }

  if (normalizedValue === query) {
    return 220;
  }

  if (normalizedValue.startsWith(query)) {
    return 160;
  }

  if (normalizedValue.includes(query)) {
    return 90;
  }

  const words = normalizedValue.split(/\s+/).filter(Boolean);
  if (words.some((word) => word.startsWith(query))) {
    return 65;
  }

  return 0;
}

const TYPE_WEIGHT: Record<TabType, number> = {
  activityPlans: 34,
  trainingPlans: 30,
  routes: 32,
  groups: 28,
  users: 24,
};

function scoreActivityPlanSearch(query: string, item: DiscoverActivityPlanItem) {
  return (
    scoreSearchTextMatch(query, item.name) +
    scoreSearchTextMatch(query, item.description) * 0.65 +
    scoreSearchTextMatch(query, item.activityCategory) * 0.4 +
    TYPE_WEIGHT.activityPlans
  );
}

function scoreTrainingPlanSearch(query: string, item: DiscoverTrainingPlanItem) {
  const activityCategoryText = Array.isArray(item.activity_category)
    ? item.activity_category.join(" ")
    : item.activity_category;
  const experienceText = Array.isArray(item.experienceLevel)
    ? item.experienceLevel.join(" ")
    : item.experienceLevel;

  return (
    scoreSearchTextMatch(query, item.name) +
    scoreSearchTextMatch(query, item.description) * 0.65 +
    scoreSearchTextMatch(query, activityCategoryText) * 0.4 +
    scoreSearchTextMatch(query, experienceText) * 0.25 +
    TYPE_WEIGHT.trainingPlans
  );
}

function scoreRouteSearch(query: string, item: DiscoverRouteItem) {
  return (
    scoreSearchTextMatch(query, item.name) +
    scoreSearchTextMatch(query, item.description) * 0.65 +
    scoreSearchTextMatch(query, item.activity_category) * 0.4 +
    TYPE_WEIGHT.routes
  );
}

function scoreGroupSearch(query: string, item: DiscoverGroupItem) {
  return (
    scoreSearchTextMatch(query, item.name) +
    scoreSearchTextMatch(query, item.description) * 0.65 +
    scoreSearchTextMatch(query, item.slug) * 0.35 +
    TYPE_WEIGHT.groups
  );
}

function scoreUserSearch(query: string, item: DiscoverUserItem) {
  return (
    scoreSearchTextMatch(query, item.username) +
    scoreSearchTextMatch(query, item.full_name) * 0.75 +
    TYPE_WEIGHT.users
  );
}

function toIsoDateString(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  return null;
}

function getTimestampValue(value: string | null) {
  if (!value) {
    return Number.NaN;
  }

  return Date.parse(value);
}

function getSortDate(item: {
  createdAt?: string | null;
  updatedAt?: string | null;
  created_at?: string | Date | null;
  updated_at?: string | Date | null;
}) {
  return (
    toIsoDateString(item.createdAt) ??
    toIsoDateString(item.created_at) ??
    toIsoDateString(item.updatedAt) ??
    toIsoDateString(item.updated_at)
  );
}

export function getRangeValidationMessage(
  label: string,
  minValue: number | null,
  maxValue: number | null,
) {
  if (minValue !== null && maxValue !== null && minValue > maxValue) {
    return `${label}: min cannot be greater than max.`;
  }

  return null;
}

export function getActivityPlanFilterErrors(filters: ActivityPlanFilters) {
  return [
    getRangeValidationMessage("Duration", filters.minDurationMinutes, filters.maxDurationMinutes),
    getRangeValidationMessage("Common Load", filters.minCommonLoad, filters.maxCommonLoad),
    getRangeValidationMessage(
      "Intensity",
      filters.minObjectiveIntensity,
      filters.maxObjectiveIntensity,
    ),
  ].filter((value): value is string => Boolean(value));
}

export function getTrainingPlanFilterErrors(filters: TrainingPlanFilters) {
  return [
    getRangeValidationMessage("Weeks", filters.minWeeks, filters.maxWeeks),
    getRangeValidationMessage("Sessions", filters.minSessionsPerWeek, filters.maxSessionsPerWeek),
  ].filter((value): value is string => Boolean(value));
}

export function getRouteFilterErrors(filters: RouteFilters) {
  return [
    getRangeValidationMessage("Distance", filters.minDistanceKm, filters.maxDistanceKm),
    getRangeValidationMessage("Ascent", filters.minAscentM, filters.maxAscentM),
  ].filter((value): value is string => Boolean(value));
}

export function matchesActivityPlanDerivedFilters(
  item: DiscoverActivityPlanItem,
  filters: ActivityPlanFilters,
) {
  const quantities = getActivityPlanQuantitySummary(item);
  const durationMinutes =
    typeof quantities.durationSeconds === "number" ? quantities.durationSeconds / 60 : null;
  const commonLoad = quantities.commonLoad;
  const objectiveIntensity = quantities.objectiveIntensity;

  if (filters.categoryIds.length > 0 && !filters.categoryIds.includes(item.activityCategory)) {
    return false;
  }

  if (
    filters.minDurationMinutes !== null &&
    (durationMinutes === null || durationMinutes < filters.minDurationMinutes)
  ) {
    return false;
  }

  if (
    filters.maxDurationMinutes !== null &&
    (durationMinutes === null || durationMinutes > filters.maxDurationMinutes)
  ) {
    return false;
  }

  if (
    filters.minCommonLoad !== null &&
    (commonLoad === null || commonLoad < filters.minCommonLoad)
  ) {
    return false;
  }

  if (
    filters.maxCommonLoad !== null &&
    (commonLoad === null || commonLoad > filters.maxCommonLoad)
  ) {
    return false;
  }

  if (
    filters.minObjectiveIntensity !== null &&
    (objectiveIntensity === null || objectiveIntensity < filters.minObjectiveIntensity)
  ) {
    return false;
  }

  if (
    filters.maxObjectiveIntensity !== null &&
    (objectiveIntensity === null || objectiveIntensity > filters.maxObjectiveIntensity)
  ) {
    return false;
  }

  return true;
}

export function areSortStatesEqual<TField extends string>(
  left: SortState<TField>,
  right: SortState<TField>,
) {
  return left.field === right.field && left.direction === right.direction;
}

export function sanitizeSortState<TField extends string>(
  sort: SortState<TField>,
  allowedFields: readonly TField[],
  fallback: SortState<TField>,
): SortState<TField> {
  if (!allowedFields.includes(sort.field)) {
    return fallback;
  }

  if (sort.direction !== "asc" && sort.direction !== "desc") {
    return fallback;
  }

  return sort;
}

export function toRouteSortParam(sort: SortState<RouteSortField>) {
  if (sort.field === "created_at") {
    return sort.direction === "asc" ? "oldest" : "newest";
  }

  if (sort.field === "distance") {
    return sort.direction === "asc" ? "distance_asc" : "distance_desc";
  }

  return sort.direction === "asc" ? "ascent_asc" : "ascent_desc";
}

export function toTrainingPlanSortParam(sort: SortState<TrainingPlanSortField>) {
  if (sort.field === "created_at") {
    return sort.direction === "asc" ? "oldest" : "newest";
  }

  if (sort.field === "duration_weeks") {
    return sort.direction === "asc" ? "duration_asc" : "duration_desc";
  }

  return sort.direction === "asc" ? "sessions_asc" : "sessions_desc";
}

export function toProfileSortParam(sort: SortState<ProfileSortField>) {
  if (sort.field === "username") {
    return sort.direction === "asc" ? "username_asc" : "username_desc";
  }

  return sort.direction === "asc" ? "oldest" : "newest";
}

type BuildDiscoverFeedItemsInput = {
  activeScope: DiscoverScope;
  activityPlans: DiscoverActivityPlanItem[];
  activityPlanFilters: ActivityPlanFilters;
  groupsList: DiscoverGroupItem[];
  hasSearchQuery: boolean;
  normalizedSearchQuery: string;
  routeSort: SortState<RouteSortField>;
  routes: DiscoverRouteItem[];
  activityPlanSort: SortState<ActivityPlanSortField>;
  profileSort: SortState<ProfileSortField>;
  trainingPlanSort: SortState<TrainingPlanSortField>;
  trainingPlans: DiscoverTrainingPlanItem[];
  users: DiscoverUserItem[];
};

export function buildDiscoverFeedItems({
  activeScope,
  activityPlans,
  activityPlanFilters,
  groupsList,
  hasSearchQuery,
  normalizedSearchQuery,
  routeSort,
  routes,
  activityPlanSort,
  profileSort,
  trainingPlanSort,
  trainingPlans,
  users,
}: BuildDiscoverFeedItemsInput) {
  const items: DiscoverFeedItem[] =
    activeScope === "activityPlans"
      ? activityPlans
          .filter((item) => matchesActivityPlanDerivedFilters(item, activityPlanFilters))
          .map((item) => ({
            id: `activityPlans-${item.id}`,
            type: "activityPlans" as const,
            item,
            sortDate: getSortDate(item),
            score: scoreActivityPlanSearch(normalizedSearchQuery, item),
          }))
      : activeScope === "trainingPlans"
        ? trainingPlans.map((item) => ({
            id: `trainingPlans-${item.id}`,
            type: "trainingPlans" as const,
            item,
            sortDate: getSortDate(item),
            score: scoreTrainingPlanSearch(normalizedSearchQuery, item),
          }))
        : activeScope === "routes"
          ? routes.map((item) => ({
              id: `routes-${item.id}`,
              type: "routes" as const,
              item,
              sortDate: getSortDate(item),
              score: scoreRouteSearch(normalizedSearchQuery, item),
            }))
          : activeScope === "groups"
            ? groupsList.map((item) => ({
                id: `groups-${item.id}`,
                type: "groups" as const,
                item,
                sortDate: getSortDate(item),
                score: scoreGroupSearch(normalizedSearchQuery, item),
              }))
            : users.map((item) => ({
                id: `users-${item.id}`,
                type: "users" as const,
                item,
                sortDate: getSortDate(item),
                score: scoreUserSearch(normalizedSearchQuery, item),
              }));

  const currentSort =
    activeScope === "activityPlans"
      ? activityPlanSort
      : activeScope === "trainingPlans"
        ? trainingPlanSort
        : activeScope === "routes"
          ? routeSort
          : activeScope === "groups"
            ? DEFAULT_GROUP_SORT
            : profileSort;

  return items.sort((left, right) => {
    const leftTimestamp = getTimestampValue(left.sortDate);
    const rightTimestamp = getTimestampValue(right.sortDate);

    if (
      activeScope === "activityPlans" &&
      left.type === "activityPlans" &&
      right.type === "activityPlans"
    ) {
      const leftQuantities = getActivityPlanQuantitySummary(left.item);
      const rightQuantities = getActivityPlanQuantitySummary(right.item);
      const leftCommonLoad = leftQuantities.commonLoad;
      const rightCommonLoad = rightQuantities.commonLoad;
      const leftObjectiveIntensity = leftQuantities.objectiveIntensity;
      const rightObjectiveIntensity = rightQuantities.objectiveIntensity;
      const metricDelta =
        currentSort.field === "estimated_duration"
          ? currentSort.direction === "desc"
            ? (rightQuantities.durationSeconds ?? -1) - (leftQuantities.durationSeconds ?? -1)
            : (leftQuantities.durationSeconds ?? Number.MAX_SAFE_INTEGER) -
              (rightQuantities.durationSeconds ?? Number.MAX_SAFE_INTEGER)
          : currentSort.field === "common_load"
            ? currentSort.direction === "desc"
              ? (rightCommonLoad ?? -1) - (leftCommonLoad ?? -1)
              : (leftCommonLoad ?? Number.MAX_SAFE_INTEGER) -
                (rightCommonLoad ?? Number.MAX_SAFE_INTEGER)
            : currentSort.field === "objective_intensity"
              ? currentSort.direction === "desc"
                ? (rightObjectiveIntensity ?? -1) - (leftObjectiveIntensity ?? -1)
                : (leftObjectiveIntensity ?? Number.MAX_SAFE_INTEGER) -
                  (rightObjectiveIntensity ?? Number.MAX_SAFE_INTEGER)
              : 0;

      if (metricDelta !== 0) {
        return metricDelta;
      }
    }

    if (
      hasSearchQuery &&
      currentSort.field === "created_at" &&
      currentSort.direction === "desc" &&
      right.score !== left.score
    ) {
      return right.score - left.score;
    }

    if (currentSort.field === "created_at" && currentSort.direction === "asc") {
      const leftComparable = Number.isNaN(leftTimestamp) ? Number.MAX_SAFE_INTEGER : leftTimestamp;
      const rightComparable = Number.isNaN(rightTimestamp)
        ? Number.MAX_SAFE_INTEGER
        : rightTimestamp;
      if (leftComparable !== rightComparable) {
        return leftComparable - rightComparable;
      }
    } else if (currentSort.field === "created_at") {
      const leftComparable = Number.isNaN(leftTimestamp) ? Number.MIN_SAFE_INTEGER : leftTimestamp;
      const rightComparable = Number.isNaN(rightTimestamp)
        ? Number.MIN_SAFE_INTEGER
        : rightTimestamp;
      if (leftComparable !== rightComparable) {
        return rightComparable - leftComparable;
      }
    }

    if (hasSearchQuery && right.score !== left.score) {
      return right.score - left.score;
    }

    return left.id.localeCompare(right.id);
  });
}
