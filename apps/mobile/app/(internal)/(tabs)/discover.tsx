import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { EmptyStateCard } from "@repo/ui/components/empty-state-card";
import { Icon } from "@repo/ui/components/icon";
import { Input } from "@repo/ui/components/input";
import { Text } from "@repo/ui/components/text";
import { ChevronRight, Search, SlidersHorizontal, X } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, TouchableOpacity, View } from "react-native";
import { AppHeader } from "@/components/shared";
import { ActivityPlanCard } from "@/components/shared/ActivityPlanCard";
import { RouteCard as SharedRouteCard } from "@/components/shared/RouteCard";
import { TrainingPlanCard as SharedTrainingPlanCard } from "@/components/shared/TrainingPlanCard";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { useTheme } from "@/lib/stores/theme-store";

const PAGE_SIZE = 25;
const SEARCH_QUERY_MAX_LENGTH = 80;

const ACTIVITY_CATEGORY_OPTIONS = [
  { id: "run", label: "Running" },
  { id: "bike", label: "Cycling" },
  { id: "swim", label: "Swimming" },
  { id: "strength", label: "Strength" },
  { id: "other", label: "Other" },
] as const;

const TRAINING_PLAN_SPORT_OPTIONS = [
  { id: "run", label: "Running" },
  { id: "bike", label: "Cycling" },
  { id: "swim", label: "Swimming" },
  { id: "strength", label: "Strength" },
  { id: "other", label: "Other" },
] as const;

const TRAINING_PLAN_EXPERIENCE_OPTIONS = [
  { id: "beginner", label: "Beginner" },
  { id: "intermediate", label: "Intermediate" },
  { id: "advanced", label: "Advanced" },
] as const;

const SCOPE_OPTIONS = [
  { id: "activityPlans", label: "Activity Plans" },
  { id: "routes", label: "Routes" },
  { id: "trainingPlans", label: "Training Plans" },
  { id: "users", label: "Profiles" },
] as const;

type TabType = "activityPlans" | "trainingPlans" | "routes" | "users";
type DiscoverScope = TabType;
type DiscoverCategoryId = (typeof ACTIVITY_CATEGORY_OPTIONS)[number]["id"];

type SortDirection = "asc" | "desc";
type ActivityPlanSortField =
  | "created_at"
  | "estimated_duration"
  | "estimated_tss"
  | "intensity_factor";
type RouteSortField = "created_at" | "distance" | "ascent";
type TrainingPlanSortField = "created_at" | "duration_weeks" | "sessions_per_week";
type ProfileSortField = "created_at" | "username";

type ActivityPlanFilters = {
  categoryIds: DiscoverCategoryId[];
  minTss: number | null;
  maxTss: number | null;
  minDurationMinutes: number | null;
  maxDurationMinutes: number | null;
  minIf: number | null;
  maxIf: number | null;
};

type TrainingPlanFilters = {
  sport: DiscoverCategoryId | null;
  experienceLevel: "beginner" | "intermediate" | "advanced" | null;
  minWeeks: number | null;
  maxWeeks: number | null;
  minSessionsPerWeek: number | null;
  maxSessionsPerWeek: number | null;
};

type RouteFilters = {
  categoryIds: DiscoverCategoryId[];
  minDistanceKm: number | null;
  maxDistanceKm: number | null;
  minAscentM: number | null;
  maxAscentM: number | null;
};

type DiscoverFeedItem = {
  id: string;
  type: TabType;
  item: any;
  sortDate: string | null;
  score: number;
};

type SortState<TField extends string> = {
  field: TField;
  direction: SortDirection;
};

const THEME_COLORS = {
  light: {
    background: "#ffffff",
    handleIndicator: "#888888",
  },
  dark: {
    background: "#18181b",
    handleIndicator: "#888888",
  },
} as const;

const BOTTOM_SHEET_BASE_STYLES = {
  handleIndicator: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  container: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
} as const;

const DEFAULT_ACTIVITY_PLAN_FILTERS: ActivityPlanFilters = {
  categoryIds: [],
  minTss: null,
  maxTss: null,
  minDurationMinutes: null,
  maxDurationMinutes: null,
  minIf: null,
  maxIf: null,
};
const DEFAULT_TRAINING_PLAN_FILTERS: TrainingPlanFilters = {
  sport: null,
  experienceLevel: null,
  minWeeks: null,
  maxWeeks: null,
  minSessionsPerWeek: null,
  maxSessionsPerWeek: null,
};
const DEFAULT_ROUTE_FILTERS: RouteFilters = {
  categoryIds: [],
  minDistanceKm: null,
  maxDistanceKm: null,
  minAscentM: null,
  maxAscentM: null,
};
const DEFAULT_ACTIVITY_PLAN_SORT: SortState<ActivityPlanSortField> = {
  field: "created_at",
  direction: "desc",
};
const DEFAULT_ROUTE_SORT: SortState<RouteSortField> = {
  field: "created_at",
  direction: "desc",
};
const DEFAULT_TRAINING_PLAN_SORT: SortState<TrainingPlanSortField> = {
  field: "created_at",
  direction: "desc",
};
const DEFAULT_PROFILE_SORT: SortState<ProfileSortField> = {
  field: "created_at",
  direction: "desc",
};

function useDebounce(value: string, delay: number): string {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

function hasActivityPlanFilters(filters: ActivityPlanFilters) {
  return Boolean(
    filters.categoryIds.length > 0 ||
      filters.minTss !== null ||
      filters.maxTss !== null ||
      filters.minDurationMinutes !== null ||
      filters.maxDurationMinutes !== null ||
      filters.minIf !== null ||
      filters.maxIf !== null,
  );
}

function hasTrainingPlanFilters(filters: TrainingPlanFilters) {
  return Boolean(
    filters.sport ||
      filters.experienceLevel ||
      filters.minWeeks !== null ||
      filters.maxWeeks !== null ||
      filters.minSessionsPerWeek !== null ||
      filters.maxSessionsPerWeek !== null,
  );
}

function hasRouteFilters(filters: RouteFilters) {
  return Boolean(
    filters.categoryIds.length > 0 ||
      filters.minDistanceKm !== null ||
      filters.maxDistanceKm !== null ||
      filters.minAscentM !== null ||
      filters.maxAscentM !== null,
  );
}

function normalizeSearchValue(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
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

function scoreSearchFeedItem(type: TabType, query: string, item: any) {
  const typeWeight: Record<TabType, number> = {
    activityPlans: 34,
    trainingPlans: 30,
    routes: 32,
    users: 24,
  };

  switch (type) {
    case "activityPlans":
      return (
        scoreSearchTextMatch(query, item.name) +
        scoreSearchTextMatch(query, item.description) * 0.65 +
        typeWeight[type]
      );
    case "trainingPlans": {
      const sportText = Array.isArray(item.sport) ? item.sport.join(" ") : item.sport;
      const experienceText = Array.isArray(item.experienceLevel)
        ? item.experienceLevel.join(" ")
        : item.experienceLevel;

      return (
        scoreSearchTextMatch(query, item.name) +
        scoreSearchTextMatch(query, item.description) * 0.65 +
        scoreSearchTextMatch(query, sportText) * 0.4 +
        scoreSearchTextMatch(query, experienceText) * 0.25 +
        typeWeight[type]
      );
    }
    case "routes":
      return (
        scoreSearchTextMatch(query, item.name) +
        scoreSearchTextMatch(query, item.description) * 0.65 +
        scoreSearchTextMatch(query, item.activity_category) * 0.4 +
        typeWeight[type]
      );
    case "users":
      return (
        scoreSearchTextMatch(query, item.username) +
        scoreSearchTextMatch(query, item.full_name) * 0.75 +
        typeWeight[type]
      );
  }
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

function getSortDate(item: any) {
  return toIsoDateString(item.created_at) ?? toIsoDateString(item.updated_at);
}

function getScopeLabel(scope: DiscoverScope) {
  return SCOPE_OPTIONS.find((option) => option.id === scope)?.label ?? "Discover";
}

function getSearchPlaceholder(scope: DiscoverScope) {
  switch (scope) {
    case "activityPlans":
      return "Search activity plans";
    case "routes":
      return "Search routes";
    case "trainingPlans":
      return "Search training plans";
    case "users":
      return "Search profiles";
  }
}

function getScopeNoun(scope: DiscoverScope) {
  switch (scope) {
    case "activityPlans":
      return "activity plans";
    case "routes":
      return "routes";
    case "trainingPlans":
      return "training plans";
    case "users":
      return "profiles";
  }
}

function parseNumericInput(value: string, options?: { allowDecimal?: boolean }) {
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

function sanitizeSearchInput(value: string) {
  return value.replace(/\s+/g, " ").slice(0, SEARCH_QUERY_MAX_LENGTH);
}

function getRangeValidationMessage(
  label: string,
  minValue: number | null,
  maxValue: number | null,
) {
  if (minValue !== null && maxValue !== null && minValue > maxValue) {
    return `${label}: min cannot be greater than max.`;
  }

  return null;
}

function getActivityPlanFilterErrors(filters: ActivityPlanFilters) {
  return [
    getRangeValidationMessage("Duration", filters.minDurationMinutes, filters.maxDurationMinutes),
    getRangeValidationMessage("TSS", filters.minTss, filters.maxTss),
    getRangeValidationMessage("IF", filters.minIf, filters.maxIf),
  ].filter((value): value is string => Boolean(value));
}

function getTrainingPlanFilterErrors(filters: TrainingPlanFilters) {
  return [
    getRangeValidationMessage("Weeks", filters.minWeeks, filters.maxWeeks),
    getRangeValidationMessage("Sessions", filters.minSessionsPerWeek, filters.maxSessionsPerWeek),
  ].filter((value): value is string => Boolean(value));
}

function getRouteFilterErrors(filters: RouteFilters) {
  return [
    getRangeValidationMessage("Distance", filters.minDistanceKm, filters.maxDistanceKm),
    getRangeValidationMessage("Ascent", filters.minAscentM, filters.maxAscentM),
  ].filter((value): value is string => Boolean(value));
}

function matchesActivityPlanDerivedFilters(item: any, filters: ActivityPlanFilters) {
  const metrics = item.authoritative_metrics;
  const durationMinutes =
    typeof metrics?.estimated_duration === "number" ? metrics.estimated_duration / 60 : null;
  const estimatedTss = typeof metrics?.estimated_tss === "number" ? metrics.estimated_tss : null;
  const intensityFactor =
    typeof metrics?.intensity_factor === "number" ? metrics.intensity_factor : null;

  if (
    filters.categoryIds.length > 0 &&
    !filters.categoryIds.includes(item.activity_category as DiscoverCategoryId)
  ) {
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

  if (filters.minTss !== null && (estimatedTss === null || estimatedTss < filters.minTss)) {
    return false;
  }

  if (filters.maxTss !== null && (estimatedTss === null || estimatedTss > filters.maxTss)) {
    return false;
  }

  if (filters.minIf !== null && (intensityFactor === null || intensityFactor < filters.minIf)) {
    return false;
  }

  if (filters.maxIf !== null && (intensityFactor === null || intensityFactor > filters.maxIf)) {
    return false;
  }

  return true;
}

function areSortStatesEqual<TField extends string>(
  left: SortState<TField>,
  right: SortState<TField>,
) {
  return left.field === right.field && left.direction === right.direction;
}

function sanitizeSortState<TField extends string>(
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

function toRouteSortParam(sort: SortState<RouteSortField>) {
  if (sort.field === "created_at") {
    return sort.direction === "asc" ? "oldest" : "newest";
  }

  if (sort.field === "distance") {
    return sort.direction === "asc" ? "distance_asc" : "distance_desc";
  }

  return sort.direction === "asc" ? "ascent_asc" : "ascent_desc";
}

function toTrainingPlanSortParam(sort: SortState<TrainingPlanSortField>) {
  if (sort.field === "created_at") {
    return sort.direction === "asc" ? "oldest" : "newest";
  }

  if (sort.field === "duration_weeks") {
    return sort.direction === "asc" ? "duration_asc" : "duration_desc";
  }

  return sort.direction === "asc" ? "sessions_asc" : "sessions_desc";
}

function toProfileSortParam(sort: SortState<ProfileSortField>) {
  if (sort.field === "username") {
    return sort.direction === "asc" ? "username_asc" : "username_desc";
  }

  return sort.direction === "asc" ? "oldest" : "newest";
}

export default function DiscoverPage() {
  const navigateTo = useAppNavigate();
  const [activeScope, setActiveScope] = useState<DiscoverScope>("activityPlans");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [activityPlanSort, setActivityPlanSort] = useState<SortState<ActivityPlanSortField>>(
    DEFAULT_ACTIVITY_PLAN_SORT,
  );
  const [draftActivityPlanSort, setDraftActivityPlanSort] = useState<
    SortState<ActivityPlanSortField>
  >(DEFAULT_ACTIVITY_PLAN_SORT);
  const [routeSort, setRouteSort] = useState<SortState<RouteSortField>>(DEFAULT_ROUTE_SORT);
  const [draftRouteSort, setDraftRouteSort] =
    useState<SortState<RouteSortField>>(DEFAULT_ROUTE_SORT);
  const [trainingPlanSort, setTrainingPlanSort] = useState<SortState<TrainingPlanSortField>>(
    DEFAULT_TRAINING_PLAN_SORT,
  );
  const [draftTrainingPlanSort, setDraftTrainingPlanSort] = useState<
    SortState<TrainingPlanSortField>
  >(DEFAULT_TRAINING_PLAN_SORT);
  const [profileSort, setProfileSort] = useState<SortState<ProfileSortField>>(DEFAULT_PROFILE_SORT);
  const [draftProfileSort, setDraftProfileSort] =
    useState<SortState<ProfileSortField>>(DEFAULT_PROFILE_SORT);
  const [activityPlanFilters, setActivityPlanFilters] = useState<ActivityPlanFilters>(
    DEFAULT_ACTIVITY_PLAN_FILTERS,
  );
  const [trainingPlanFilters, setTrainingPlanFilters] = useState<TrainingPlanFilters>(
    DEFAULT_TRAINING_PLAN_FILTERS,
  );
  const [routeFilters, setRouteFilters] = useState<RouteFilters>(DEFAULT_ROUTE_FILTERS);
  const [draftActivityPlanFilters, setDraftActivityPlanFilters] = useState<ActivityPlanFilters>(
    DEFAULT_ACTIVITY_PLAN_FILTERS,
  );
  const [draftTrainingPlanFilters, setDraftTrainingPlanFilters] = useState<TrainingPlanFilters>(
    DEFAULT_TRAINING_PLAN_FILTERS,
  );
  const [draftRouteFilters, setDraftRouteFilters] = useState<RouteFilters>(DEFAULT_ROUTE_FILTERS);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

  const validatedSearchQuery = debouncedSearch.trim();
  const hasSearchQuery = validatedSearchQuery.length > 0;
  const normalizedSearchQuery = normalizeSearchValue(validatedSearchQuery);
  const safeActivityPlanSort = sanitizeSortState(
    activityPlanSort,
    ["created_at", "estimated_duration", "estimated_tss", "intensity_factor"] as const,
    DEFAULT_ACTIVITY_PLAN_SORT,
  );
  const safeTrainingPlanSort = sanitizeSortState(
    trainingPlanSort,
    ["created_at", "duration_weeks", "sessions_per_week"] as const,
    DEFAULT_TRAINING_PLAN_SORT,
  );
  const safeRouteSort = sanitizeSortState(
    routeSort,
    ["created_at", "distance", "ascent"] as const,
    DEFAULT_ROUTE_SORT,
  );
  const safeProfileSort = sanitizeSortState(
    profileSort,
    ["created_at", "username"] as const,
    DEFAULT_PROFILE_SORT,
  );
  const shouldLoadActivityPlans = activeScope === "activityPlans";
  const shouldLoadTrainingPlans = activeScope === "trainingPlans";
  const shouldLoadRoutes = activeScope === "routes";
  const shouldLoadUsers = activeScope === "users";

  const activityPlansInfiniteQuery = api.activityPlans.list.useInfiniteQuery(
    {
      includeSystemTemplates: true,
      includeOwnOnly: false,
      includeEstimation: true,
      ownerScope: "all",
      search: validatedSearchQuery || undefined,
      activityCategories: activityPlanFilters.categoryIds.length
        ? activityPlanFilters.categoryIds
        : undefined,
      limit: PAGE_SIZE,
    },
    {
      enabled: shouldLoadActivityPlans,
      getNextPageParam: (lastPage: any) => lastPage.nextCursor,
    },
  );

  const trainingPlansInfiniteQuery = api.trainingPlans.listTemplates.useInfiniteQuery(
    {
      search: validatedSearchQuery || undefined,
      sport: trainingPlanFilters.sport || undefined,
      experience_level: trainingPlanFilters.experienceLevel || undefined,
      min_weeks: trainingPlanFilters.minWeeks || undefined,
      max_weeks: trainingPlanFilters.maxWeeks || undefined,
      min_sessions_per_week: trainingPlanFilters.minSessionsPerWeek || undefined,
      max_sessions_per_week: trainingPlanFilters.maxSessionsPerWeek || undefined,
      sort_by: toTrainingPlanSortParam(safeTrainingPlanSort),
      limit: PAGE_SIZE,
    },
    {
      enabled: shouldLoadTrainingPlans,
      getNextPageParam: (lastPage: any) => lastPage.nextCursor,
    },
  );

  const routesInfiniteQuery = api.routes.list.useInfiniteQuery(
    {
      search: validatedSearchQuery || undefined,
      activityCategories: routeFilters.categoryIds.length ? routeFilters.categoryIds : undefined,
      min_distance_m:
        routeFilters.minDistanceKm !== null
          ? Math.round(routeFilters.minDistanceKm * 1000)
          : undefined,
      max_distance_m:
        routeFilters.maxDistanceKm !== null
          ? Math.round(routeFilters.maxDistanceKm * 1000)
          : undefined,
      min_ascent_m: routeFilters.minAscentM || undefined,
      max_ascent_m: routeFilters.maxAscentM || undefined,
      sort_by: toRouteSortParam(safeRouteSort),
      limit: PAGE_SIZE,
    },
    {
      enabled: shouldLoadRoutes,
      getNextPageParam: (lastPage: any) => lastPage.nextCursor,
    },
  );

  const usersInfiniteQuery = api.social.searchUsers.useInfiniteQuery(
    {
      query: validatedSearchQuery || undefined,
      limit: PAGE_SIZE,
      sort_by: toProfileSortParam(safeProfileSort),
    },
    {
      enabled: shouldLoadUsers,
      getNextPageParam: (lastPage: any) => lastPage.nextCursor,
    },
  );

  const activityPlans = useMemo(() => {
    return shouldLoadActivityPlans
      ? activityPlansInfiniteQuery.data?.pages.flatMap((page: any) => page.items) || []
      : [];
  }, [activityPlansInfiniteQuery.data, shouldLoadActivityPlans]);

  const trainingPlans = useMemo(() => {
    return shouldLoadTrainingPlans
      ? trainingPlansInfiniteQuery.data?.pages.flatMap((page: any) => page.items) || []
      : [];
  }, [shouldLoadTrainingPlans, trainingPlansInfiniteQuery.data]);

  const routes = useMemo(() => {
    return shouldLoadRoutes
      ? routesInfiniteQuery.data?.pages.flatMap((page: any) => page.items) || []
      : [];
  }, [routesInfiniteQuery.data, shouldLoadRoutes]);

  const users = useMemo(() => {
    return shouldLoadUsers
      ? usersInfiniteQuery.data?.pages.flatMap((page: any) => page.users) || []
      : [];
  }, [shouldLoadUsers, usersInfiniteQuery.data]);

  const hasSubFilters =
    (activeScope === "activityPlans" && hasActivityPlanFilters(activityPlanFilters)) ||
    (activeScope === "trainingPlans" && hasTrainingPlanFilters(trainingPlanFilters)) ||
    (activeScope === "routes" && hasRouteFilters(routeFilters));
  const hasAnyFilters =
    hasSubFilters ||
    (activeScope === "activityPlans" &&
      !areSortStatesEqual(safeActivityPlanSort, DEFAULT_ACTIVITY_PLAN_SORT)) ||
    (activeScope === "trainingPlans" &&
      !areSortStatesEqual(safeTrainingPlanSort, DEFAULT_TRAINING_PLAN_SORT)) ||
    (activeScope === "routes" && !areSortStatesEqual(safeRouteSort, DEFAULT_ROUTE_SORT)) ||
    (activeScope === "users" && !areSortStatesEqual(safeProfileSort, DEFAULT_PROFILE_SORT));
  const draftFilterErrors = useMemo(() => {
    if (activeScope === "activityPlans") {
      return getActivityPlanFilterErrors(draftActivityPlanFilters);
    }

    if (activeScope === "trainingPlans") {
      return getTrainingPlanFilterErrors(draftTrainingPlanFilters);
    }

    if (activeScope === "routes") {
      return getRouteFilterErrors(draftRouteFilters);
    }

    return [];
  }, [activeScope, draftActivityPlanFilters, draftRouteFilters, draftTrainingPlanFilters]);
  const isFilterApplyDisabled = draftFilterErrors.length > 0;
  const syncDraftFiltersFromApplied = useCallback(() => {
    setDraftActivityPlanSort(activityPlanSort);
    setDraftRouteSort(routeSort);
    setDraftTrainingPlanSort(trainingPlanSort);
    setDraftProfileSort(profileSort);
    setDraftActivityPlanFilters(activityPlanFilters);
    setDraftTrainingPlanFilters(trainingPlanFilters);
    setDraftRouteFilters(routeFilters);
  }, [
    activityPlanFilters,
    activityPlanSort,
    profileSort,
    routeFilters,
    routeSort,
    trainingPlanFilters,
    trainingPlanSort,
  ]);

  const handleTemplatePress = (template: any) => {
    navigateTo({
      pathname: "/(internal)/(standard)/activity-plan-detail",
      params: {
        template: JSON.stringify(template),
        source: "discover",
      },
    } as any);
  };

  const handleTrainingPlanPress = (template: any) => {
    navigateTo(ROUTES.PLAN.TRAINING_PLAN.DETAIL(template.id) as any);
  };

  const handleRoutePress = (route: any) => {
    navigateTo({
      pathname: "/(internal)/(standard)/route-detail",
      params: { id: route.id },
    } as any);
  };

  const handleUserPress = (user: any) => {
    navigateTo({
      pathname: "/(internal)/(standard)/user/[userId]",
      params: { userId: user.id },
    } as any);
  };

  const handleOpenFilterSheet = () => {
    syncDraftFiltersFromApplied();
    setIsFilterSheetOpen(true);
  };

  const handleCloseFilterSheet = () => {
    syncDraftFiltersFromApplied();
    setIsFilterSheetOpen(false);
  };

  const handleApplyFilters = () => {
    if (isFilterApplyDisabled) {
      return;
    }

    if (activeScope === "activityPlans") {
      setActivityPlanSort(draftActivityPlanSort);
      setActivityPlanFilters(draftActivityPlanFilters);
    } else if (activeScope === "trainingPlans") {
      setTrainingPlanSort(draftTrainingPlanSort);
      setTrainingPlanFilters(draftTrainingPlanFilters);
    } else if (activeScope === "routes") {
      setRouteSort(draftRouteSort);
      setRouteFilters(draftRouteFilters);
    } else {
      setProfileSort(draftProfileSort);
    }
    setIsFilterSheetOpen(false);
  };

  const handleResetDraftFilters = () => {
    if (activeScope === "activityPlans") {
      setDraftActivityPlanSort(DEFAULT_ACTIVITY_PLAN_SORT);
      setDraftActivityPlanFilters(DEFAULT_ACTIVITY_PLAN_FILTERS);
    } else if (activeScope === "trainingPlans") {
      setDraftTrainingPlanSort(DEFAULT_TRAINING_PLAN_SORT);
      setDraftTrainingPlanFilters(DEFAULT_TRAINING_PLAN_FILTERS);
    } else if (activeScope === "routes") {
      setDraftRouteSort(DEFAULT_ROUTE_SORT);
      setDraftRouteFilters(DEFAULT_ROUTE_FILTERS);
    } else {
      setDraftProfileSort(DEFAULT_PROFILE_SORT);
    }
  };

  const handleResetFilters = useCallback(() => {
    if (activeScope === "activityPlans") {
      setActivityPlanSort(DEFAULT_ACTIVITY_PLAN_SORT);
      setActivityPlanFilters(DEFAULT_ACTIVITY_PLAN_FILTERS);
    } else if (activeScope === "trainingPlans") {
      setTrainingPlanSort(DEFAULT_TRAINING_PLAN_SORT);
      setTrainingPlanFilters(DEFAULT_TRAINING_PLAN_FILTERS);
    } else if (activeScope === "routes") {
      setRouteSort(DEFAULT_ROUTE_SORT);
      setRouteFilters(DEFAULT_ROUTE_FILTERS);
    } else {
      setProfileSort(DEFAULT_PROFILE_SORT);
    }
  }, [activeScope]);

  const handleEmptyStateAction = () => {
    if (searchQuery.length > 0) {
      setSearchQuery("");
    }

    if (hasAnyFilters) {
      handleResetFilters();
    }
  };

  const hasNextPage =
    (shouldLoadActivityPlans && activityPlansInfiniteQuery.hasNextPage) ||
    (shouldLoadTrainingPlans && trainingPlansInfiniteQuery.hasNextPage) ||
    (shouldLoadRoutes && routesInfiniteQuery.hasNextPage) ||
    (shouldLoadUsers && usersInfiniteQuery.hasNextPage);
  const isFetchingNextPage =
    (shouldLoadActivityPlans && activityPlansInfiniteQuery.isFetchingNextPage) ||
    (shouldLoadTrainingPlans && trainingPlansInfiniteQuery.isFetchingNextPage) ||
    (shouldLoadRoutes && routesInfiniteQuery.isFetchingNextPage) ||
    (shouldLoadUsers && usersInfiniteQuery.isFetchingNextPage);

  const handleLoadNextPage = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage) {
      return;
    }

    if (activeScope === "activityPlans") {
      void activityPlansInfiniteQuery.fetchNextPage();
      return;
    }

    if (activeScope === "trainingPlans") {
      void trainingPlansInfiniteQuery.fetchNextPage();
      return;
    }

    if (activeScope === "routes") {
      void routesInfiniteQuery.fetchNextPage();
      return;
    }

    void usersInfiniteQuery.fetchNextPage();
  }, [
    activeScope,
    activityPlansInfiniteQuery,
    hasNextPage,
    isFetchingNextPage,
    routesInfiniteQuery,
    trainingPlansInfiniteQuery,
    usersInfiniteQuery,
  ]);

  const feedItems = useMemo<DiscoverFeedItem[]>(() => {
    const items: DiscoverFeedItem[] =
      activeScope === "activityPlans"
        ? activityPlans
            .filter((item) => matchesActivityPlanDerivedFilters(item, activityPlanFilters))
            .map((item: any) => ({
              id: `activityPlans-${item.id}`,
              type: "activityPlans" as const,
              item,
              sortDate: getSortDate(item),
              score: scoreSearchFeedItem("activityPlans", normalizedSearchQuery, item),
            }))
        : activeScope === "trainingPlans"
          ? trainingPlans.map((item: any) => ({
              id: `trainingPlans-${item.id}`,
              type: "trainingPlans" as const,
              item,
              sortDate: getSortDate(item),
              score: scoreSearchFeedItem("trainingPlans", normalizedSearchQuery, item),
            }))
          : activeScope === "routes"
            ? routes.map((item: any) => ({
                id: `routes-${item.id}`,
                type: "routes" as const,
                item,
                sortDate: getSortDate(item),
                score: scoreSearchFeedItem("routes", normalizedSearchQuery, item),
              }))
            : users.map((item: any) => ({
                id: `users-${item.id}`,
                type: "users" as const,
                item,
                sortDate: getSortDate(item),
                score: scoreSearchFeedItem("users", normalizedSearchQuery, item),
              }));

    const currentSort =
      activeScope === "activityPlans"
        ? safeActivityPlanSort
        : activeScope === "trainingPlans"
          ? safeTrainingPlanSort
          : activeScope === "routes"
            ? safeRouteSort
            : safeProfileSort;

    return items.sort((left, right) => {
      const leftTimestamp = getTimestampValue(left.sortDate);
      const rightTimestamp = getTimestampValue(right.sortDate);
      const leftMetrics = left.item?.authoritative_metrics;
      const rightMetrics = right.item?.authoritative_metrics;

      if (activeScope === "activityPlans") {
        const metricDelta =
          currentSort.field === "estimated_duration"
            ? currentSort.direction === "desc"
              ? (rightMetrics?.estimated_duration ?? -1) - (leftMetrics?.estimated_duration ?? -1)
              : (leftMetrics?.estimated_duration ?? Number.MAX_SAFE_INTEGER) -
                (rightMetrics?.estimated_duration ?? Number.MAX_SAFE_INTEGER)
            : currentSort.field === "estimated_tss"
              ? currentSort.direction === "desc"
                ? (rightMetrics?.estimated_tss ?? -1) - (leftMetrics?.estimated_tss ?? -1)
                : (leftMetrics?.estimated_tss ?? Number.MAX_SAFE_INTEGER) -
                  (rightMetrics?.estimated_tss ?? Number.MAX_SAFE_INTEGER)
              : currentSort.field === "intensity_factor"
                ? currentSort.direction === "desc"
                  ? (rightMetrics?.intensity_factor ?? -1) - (leftMetrics?.intensity_factor ?? -1)
                  : (leftMetrics?.intensity_factor ?? Number.MAX_SAFE_INTEGER) -
                    (rightMetrics?.intensity_factor ?? Number.MAX_SAFE_INTEGER)
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
        const leftComparable = Number.isNaN(leftTimestamp)
          ? Number.MAX_SAFE_INTEGER
          : leftTimestamp;
        const rightComparable = Number.isNaN(rightTimestamp)
          ? Number.MAX_SAFE_INTEGER
          : rightTimestamp;
        if (leftComparable !== rightComparable) {
          return leftComparable - rightComparable;
        }
      } else if (currentSort.field === "created_at") {
        const leftComparable = Number.isNaN(leftTimestamp)
          ? Number.MIN_SAFE_INTEGER
          : leftTimestamp;
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
  }, [
    activeScope,
    activityPlans,
    activityPlanFilters,
    activityPlanSort,
    hasSearchQuery,
    normalizedSearchQuery,
    safeActivityPlanSort,
    safeProfileSort,
    safeRouteSort,
    safeTrainingPlanSort,
    routes,
    trainingPlans,
    users,
  ]);

  const isContentLoading =
    (shouldLoadActivityPlans &&
      activityPlansInfiniteQuery.isLoading &&
      activityPlans.length === 0) ||
    (shouldLoadTrainingPlans &&
      trainingPlansInfiniteQuery.isLoading &&
      trainingPlans.length === 0) ||
    (shouldLoadRoutes && routesInfiniteQuery.isLoading && routes.length === 0) ||
    (shouldLoadUsers && usersInfiniteQuery.isLoading && users.length === 0);

  const resultCountLabel = `${feedItems.length} item${feedItems.length === 1 ? "" : "s"}`;
  const resultsMetaText = hasSearchQuery
    ? `${resultCountLabel} for \"${validatedSearchQuery}\"`
    : resultCountLabel;

  const renderSearchInput = () => {
    const clearButtonRight = 52;

    return (
      <View className="border-b border-border bg-background px-4 pb-3 pt-4">
        <View className="relative rounded-2xl border border-border bg-card">
          <View className="absolute left-3 top-1/2 -translate-y-1/2">
            <Icon as={Search} size={18} className="text-muted-foreground" />
          </View>
          <Input
            placeholder={getSearchPlaceholder(activeScope)}
            value={searchQuery}
            onChangeText={(value) => setSearchQuery(sanitizeSearchInput(value))}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            maxLength={SEARCH_QUERY_MAX_LENGTH}
            className="h-12 border-0 bg-transparent pl-10 pr-24"
            testID="discover-search-input"
          />

          {searchQuery.length > 0 ? (
            <TouchableOpacity
              className="absolute top-1/2 -translate-y-1/2"
              style={{ right: clearButtonRight }}
              onPress={() => setSearchQuery("")}
              activeOpacity={0.8}
              testID="discover-search-clear"
            >
              <Icon as={X} size={18} className="text-muted-foreground" />
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            className={`absolute right-2 top-1/2 h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border ${
              hasAnyFilters ? "border-primary bg-primary" : "border-border bg-background"
            }`}
            onPress={handleOpenFilterSheet}
            activeOpacity={0.85}
            testID="discover-filter-button"
            accessibilityState={{ selected: hasAnyFilters }}
          >
            <Icon
              as={SlidersHorizontal}
              size={16}
              className={hasAnyFilters ? "text-primary-foreground" : "text-foreground"}
            />
            {hasAnyFilters ? (
              <View
                className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-background"
                testID="discover-filter-button-dot"
              />
            ) : null}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderScopeRow = () => (
    <View className="border-b border-border bg-background py-3">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16 }}
        testID="discover-scope-row"
      >
        <View className="flex-row rounded-2xl border border-border/80 bg-muted/35 p-1">
          {SCOPE_OPTIONS.map((option) => {
            const isActive = activeScope === option.id;

            return (
              <TouchableOpacity
                key={option.id}
                onPress={() => setActiveScope(option.id)}
                activeOpacity={0.85}
                testID={`discover-scope-${option.id}`}
                className={`items-center justify-center rounded-xl px-3 py-2 ${
                  isActive ? "bg-background" : "bg-transparent"
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    isActive ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );

  const renderLoadingSkeleton = () => (
    <View className="gap-4 p-4">
      {[1, 2, 3].map((i) => (
        <View key={i} className="h-28 rounded-2xl bg-muted animate-pulse" />
      ))}
    </View>
  );

  const renderEmptyState = () => {
    const actionLabel =
      searchQuery.length > 0 && hasAnyFilters
        ? "Clear search & filters"
        : hasAnyFilters
          ? "Reset filters"
          : searchQuery.length > 0
            ? "Clear search"
            : undefined;

    const title = hasSearchQuery
      ? `No ${getScopeNoun(activeScope)} found`
      : `No ${getScopeNoun(activeScope)} yet`;

    const description = hasSearchQuery
      ? `Try another search term or remove a filter to widen the ${getScopeNoun(activeScope)} list.`
      : `Switch record type or check back after more ${getScopeNoun(activeScope)} are added.`;

    return (
      <View className="px-4 py-12">
        <EmptyStateCard
          icon={Search}
          title={title}
          description={description}
          actionLabel={actionLabel}
          onAction={actionLabel ? handleEmptyStateAction : undefined}
        />
      </View>
    );
  };

  const renderLoadMoreActions = () => {
    if (!hasNextPage && !isFetchingNextPage) {
      return null;
    }

    return (
      <View className="px-4 pb-8 pt-2">
        <Text className="text-center text-xs text-muted-foreground">
          {isFetchingNextPage
            ? `Loading more ${getScopeNoun(activeScope)}...`
            : `Scroll to load more ${getScopeNoun(activeScope)}.`}
        </Text>
      </View>
    );
  };

  const renderFeedItem = (result: DiscoverFeedItem) => (
    <View key={result.id} testID={`discover-feed-item-${result.id}`}>
      {result.type === "activityPlans" ? (
        <ActivityPlanCard
          activityPlan={result.item as any}
          onPress={() => handleTemplatePress(result.item)}
          variant="default"
        />
      ) : null}
      {result.type === "trainingPlans" ? (
        <TrainingPlanCard
          template={result.item}
          onPress={() => handleTrainingPlanPress(result.item)}
        />
      ) : null}
      {result.type === "routes" ? (
        <RouteCard route={result.item} onPress={() => handleRoutePress(result.item)} />
      ) : null}
      {result.type === "users" ? (
        <UserCard user={result.item} onPress={() => handleUserPress(result.item)} />
      ) : null}
    </View>
  );

  const renderContent = () => {
    if (isContentLoading && feedItems.length === 0) {
      return renderLoadingSkeleton();
    }

    if (feedItems.length === 0) {
      return renderEmptyState();
    }

    return (
      <ScrollView
        testID="discover-results-list"
        contentContainerStyle={{ paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
        onScroll={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
          const distanceFromBottom =
            contentSize.height - (contentOffset.y + layoutMeasurement.height);
          if (distanceFromBottom < 240) {
            handleLoadNextPage();
          }
        }}
        scrollEventThrottle={16}
      >
        <View className="gap-4 px-4 pb-2 pt-4">
          <View className="px-1">
            <Text className="text-xs text-muted-foreground">{resultsMetaText}</Text>
          </View>
          {feedItems.map(renderFeedItem)}
        </View>
        {renderLoadMoreActions()}
      </ScrollView>
    );
  };

  return (
    <View className="flex-1 bg-background" testID="discover-screen">
      <AppHeader title="Discover" />
      {renderSearchInput()}
      {renderScopeRow()}
      {renderContent()}
      <DiscoverFilterSheet
        visible={isFilterSheetOpen}
        scope={activeScope}
        activityPlanSort={draftActivityPlanSort}
        onActivityPlanSortChange={setDraftActivityPlanSort}
        routeSort={draftRouteSort}
        onRouteSortChange={setDraftRouteSort}
        trainingPlanSort={draftTrainingPlanSort}
        onTrainingPlanSortChange={setDraftTrainingPlanSort}
        profileSort={draftProfileSort}
        onProfileSortChange={setDraftProfileSort}
        activityPlanFilters={draftActivityPlanFilters}
        onActivityPlanFiltersChange={setDraftActivityPlanFilters}
        trainingPlanFilters={draftTrainingPlanFilters}
        onTrainingPlanFiltersChange={setDraftTrainingPlanFilters}
        routeFilters={draftRouteFilters}
        onRouteFiltersChange={setDraftRouteFilters}
        validationErrors={draftFilterErrors}
        onReset={handleResetDraftFilters}
        onApply={handleApplyFilters}
        onClose={handleCloseFilterSheet}
      />
    </View>
  );
}

function FilterChip({
  label,
  isActive,
  onPress,
  testID,
}: {
  label: string;
  isActive: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      testID={testID}
      className={`rounded-full border px-3 py-2 ${
        isActive ? "border-primary bg-primary/10" : "border-border bg-background"
      }`}
    >
      <Text
        className={`text-xs font-medium ${isActive ? "text-primary" : "text-muted-foreground"}`}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

interface DiscoverFilterSheetProps {
  visible: boolean;
  scope: DiscoverScope;
  activityPlanSort: SortState<ActivityPlanSortField>;
  onActivityPlanSortChange: (value: SortState<ActivityPlanSortField>) => void;
  routeSort: SortState<RouteSortField>;
  onRouteSortChange: (value: SortState<RouteSortField>) => void;
  trainingPlanSort: SortState<TrainingPlanSortField>;
  onTrainingPlanSortChange: (value: SortState<TrainingPlanSortField>) => void;
  profileSort: SortState<ProfileSortField>;
  onProfileSortChange: (value: SortState<ProfileSortField>) => void;
  activityPlanFilters: ActivityPlanFilters;
  onActivityPlanFiltersChange: (filters: ActivityPlanFilters) => void;
  trainingPlanFilters: TrainingPlanFilters;
  onTrainingPlanFiltersChange: (filters: TrainingPlanFilters) => void;
  routeFilters: RouteFilters;
  onRouteFiltersChange: (filters: RouteFilters) => void;
  validationErrors: string[];
  onReset: () => void;
  onApply: () => void;
  onClose: () => void;
}

function DiscoverFilterSheet({
  visible,
  scope,
  activityPlanSort,
  onActivityPlanSortChange,
  routeSort,
  onRouteSortChange,
  trainingPlanSort,
  onTrainingPlanSortChange,
  profileSort,
  onProfileSortChange,
  activityPlanFilters,
  onActivityPlanFiltersChange,
  trainingPlanFilters,
  onTrainingPlanFiltersChange,
  routeFilters,
  onRouteFiltersChange,
  validationErrors,
  onReset,
  onApply,
  onClose,
}: DiscoverFilterSheetProps) {
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ["92%"], []);
  const { resolvedTheme } = useTheme();
  const themeColors = THEME_COLORS[resolvedTheme === "dark" ? "dark" : "light"];
  const bottomSheetStyles = useMemo(
    () => ({
      handleIndicator: {
        ...BOTTOM_SHEET_BASE_STYLES.handleIndicator,
        backgroundColor: themeColors.handleIndicator,
      },
      background: {
        backgroundColor: themeColors.background,
      },
      container: BOTTOM_SHEET_BASE_STYLES.container,
    }),
    [themeColors],
  );

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
      />
    ),
    [],
  );

  const isResetDisabled =
    (scope === "activityPlans" &&
      areSortStatesEqual(activityPlanSort, DEFAULT_ACTIVITY_PLAN_SORT) &&
      !hasActivityPlanFilters(activityPlanFilters)) ||
    (scope === "trainingPlans" &&
      areSortStatesEqual(trainingPlanSort, DEFAULT_TRAINING_PLAN_SORT) &&
      !hasTrainingPlanFilters(trainingPlanFilters)) ||
    (scope === "routes" &&
      areSortStatesEqual(routeSort, DEFAULT_ROUTE_SORT) &&
      !hasRouteFilters(routeFilters)) ||
    (scope === "users" && areSortStatesEqual(profileSort, DEFAULT_PROFILE_SORT));

  if (!visible) {
    return null;
  }

  const showActivityPlanFilters = scope === "activityPlans";
  const showTrainingPlanFilters = scope === "trainingPlans";
  const showRouteFilters = scope === "routes";

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={0}
      snapPoints={snapPoints}
      enablePanDownToClose
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      backdropComponent={renderBackdrop}
      onClose={onClose}
      handleIndicatorStyle={bottomSheetStyles.handleIndicator}
      backgroundStyle={bottomSheetStyles.background}
      style={bottomSheetStyles.container}
    >
      <BottomSheetView className="flex-1" testID="discover-filter-sheet">
        <BottomSheetScrollView
          contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 6, paddingBottom: 156 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-1 border-b border-border pb-3">
            <Text className="text-lg font-semibold text-foreground">Sort & Filters</Text>
            <Text className="text-sm text-muted-foreground">
              {`Refine the ${getScopeNoun(scope)} list.`}
            </Text>
          </View>

          {validationErrors.length > 0 ? (
            <View className="mt-4 gap-1 rounded-2xl border border-destructive/40 bg-destructive/10 px-3 py-3">
              {validationErrors.map((error) => (
                <Text key={error} className="text-xs text-destructive">
                  {error}
                </Text>
              ))}
            </View>
          ) : null}

          {scope === "activityPlans" ? (
            <View className="mt-4 gap-3">
              <FilterSection title="Sort">
                <SortFieldSelector
                  options={[
                    {
                      label: "Created",
                      value: "created_at",
                      testID: "discover-filter-sort-field-created-at",
                    },
                    {
                      label: "Duration",
                      value: "estimated_duration",
                      testID: "discover-filter-sort-field-duration",
                    },
                    {
                      label: "TSS",
                      value: "estimated_tss",
                      testID: "discover-filter-sort-field-tss",
                    },
                    {
                      label: "IF",
                      value: "intensity_factor",
                      testID: "discover-filter-sort-field-if",
                    },
                  ]}
                  value={activityPlanSort.field}
                  onChange={(value) =>
                    onActivityPlanSortChange({
                      ...activityPlanSort,
                      field: value as ActivityPlanSortField,
                    })
                  }
                />
                <DirectionToggle
                  direction={activityPlanSort.direction}
                  onChange={(direction) =>
                    onActivityPlanSortChange({ ...activityPlanSort, direction })
                  }
                />
              </FilterSection>

              <FilterSection title="Activity plan type">
                <View className="flex-row flex-wrap gap-2">
                  {ACTIVITY_CATEGORY_OPTIONS.map((category) => (
                    <FilterChip
                      key={category.id}
                      label={category.label}
                      isActive={activityPlanFilters.categoryIds.includes(category.id)}
                      onPress={() =>
                        onActivityPlanFiltersChange({
                          ...activityPlanFilters,
                          categoryIds: activityPlanFilters.categoryIds.includes(category.id)
                            ? activityPlanFilters.categoryIds.filter((id) => id !== category.id)
                            : [...activityPlanFilters.categoryIds, category.id],
                        })
                      }
                      testID={`discover-filter-activityPlans-category-${category.id}`}
                    />
                  ))}
                </View>
              </FilterSection>

              <FilterSection title="Estimated duration">
                <RangeInputRow
                  minValue={activityPlanFilters.minDurationMinutes}
                  maxValue={activityPlanFilters.maxDurationMinutes}
                  onMinChange={(value) =>
                    onActivityPlanFiltersChange({
                      ...activityPlanFilters,
                      minDurationMinutes: parseNumericInput(value),
                    })
                  }
                  onMaxChange={(value) =>
                    onActivityPlanFiltersChange({
                      ...activityPlanFilters,
                      maxDurationMinutes: parseNumericInput(value),
                    })
                  }
                  minPlaceholder="Min minutes"
                  maxPlaceholder="Max minutes"
                  unitLabel="minutes"
                  testIDPrefix="discover-filter-activityPlans-duration"
                />
              </FilterSection>

              <FilterSection title="Estimated TSS">
                <RangeInputRow
                  minValue={activityPlanFilters.minTss}
                  maxValue={activityPlanFilters.maxTss}
                  onMinChange={(value) =>
                    onActivityPlanFiltersChange({
                      ...activityPlanFilters,
                      minTss: parseNumericInput(value),
                    })
                  }
                  onMaxChange={(value) =>
                    onActivityPlanFiltersChange({
                      ...activityPlanFilters,
                      maxTss: parseNumericInput(value),
                    })
                  }
                  minPlaceholder="Min TSS"
                  maxPlaceholder="Max TSS"
                  unitLabel="stress score"
                  testIDPrefix="discover-filter-activityPlans-tss"
                />
              </FilterSection>

              <FilterSection title="Intensity factor">
                <RangeInputRow
                  minValue={activityPlanFilters.minIf}
                  maxValue={activityPlanFilters.maxIf}
                  onMinChange={(value) =>
                    onActivityPlanFiltersChange({
                      ...activityPlanFilters,
                      minIf: parseNumericInput(value, { allowDecimal: true }),
                    })
                  }
                  onMaxChange={(value) =>
                    onActivityPlanFiltersChange({
                      ...activityPlanFilters,
                      maxIf: parseNumericInput(value, { allowDecimal: true }),
                    })
                  }
                  minPlaceholder="Min IF"
                  maxPlaceholder="Max IF"
                  keyboardType="decimal-pad"
                  unitLabel="intensity factor"
                  testIDPrefix="discover-filter-activityPlans-if"
                />
              </FilterSection>
            </View>
          ) : null}

          {showTrainingPlanFilters ? (
            <View className="mt-4 gap-3">
              <FilterSection title="Sort">
                <SortFieldSelector
                  options={[
                    {
                      label: "Created",
                      value: "created_at",
                      testID: "discover-filter-sort-field-created-at",
                    },
                    {
                      label: "Duration",
                      value: "duration_weeks",
                      testID: "discover-filter-sort-field-duration",
                    },
                    {
                      label: "Sessions",
                      value: "sessions_per_week",
                      testID: "discover-filter-sort-field-sessions",
                    },
                  ]}
                  value={trainingPlanSort.field}
                  onChange={(value) =>
                    onTrainingPlanSortChange({
                      ...trainingPlanSort,
                      field: value as TrainingPlanSortField,
                    })
                  }
                />
                <DirectionToggle
                  direction={trainingPlanSort.direction}
                  onChange={(direction) =>
                    onTrainingPlanSortChange({ ...trainingPlanSort, direction })
                  }
                />
              </FilterSection>

              <FilterSection title="Training plan sport">
                <View className="flex-row flex-wrap gap-2">
                  {TRAINING_PLAN_SPORT_OPTIONS.map((option) => (
                    <FilterChip
                      key={option.id}
                      label={option.label}
                      isActive={trainingPlanFilters.sport === option.id}
                      onPress={() =>
                        onTrainingPlanFiltersChange({
                          ...trainingPlanFilters,
                          sport: trainingPlanFilters.sport === option.id ? null : option.id,
                        })
                      }
                      testID={`discover-filter-trainingPlans-sport-${option.id}`}
                    />
                  ))}
                </View>
              </FilterSection>

              <FilterSection title="Experience">
                <View className="flex-row flex-wrap gap-2">
                  {TRAINING_PLAN_EXPERIENCE_OPTIONS.map((option) => (
                    <FilterChip
                      key={option.id}
                      label={option.label}
                      isActive={trainingPlanFilters.experienceLevel === option.id}
                      onPress={() =>
                        onTrainingPlanFiltersChange({
                          ...trainingPlanFilters,
                          experienceLevel:
                            trainingPlanFilters.experienceLevel === option.id ? null : option.id,
                        })
                      }
                      testID={`discover-filter-trainingPlans-experience-${option.id}`}
                    />
                  ))}
                </View>
              </FilterSection>

              <FilterSection title="Duration weeks">
                <RangeInputRow
                  minValue={trainingPlanFilters.minWeeks}
                  maxValue={trainingPlanFilters.maxWeeks}
                  onMinChange={(value) =>
                    onTrainingPlanFiltersChange({
                      ...trainingPlanFilters,
                      minWeeks: parseNumericInput(value),
                    })
                  }
                  onMaxChange={(value) =>
                    onTrainingPlanFiltersChange({
                      ...trainingPlanFilters,
                      maxWeeks: parseNumericInput(value),
                    })
                  }
                  minPlaceholder="Min weeks"
                  maxPlaceholder="Max weeks"
                  unitLabel="weeks"
                  testIDPrefix="discover-filter-trainingPlans-weeks"
                />
              </FilterSection>

              <FilterSection title="Sessions per week">
                <RangeInputRow
                  minValue={trainingPlanFilters.minSessionsPerWeek}
                  maxValue={trainingPlanFilters.maxSessionsPerWeek}
                  onMinChange={(value) =>
                    onTrainingPlanFiltersChange({
                      ...trainingPlanFilters,
                      minSessionsPerWeek: parseNumericInput(value),
                    })
                  }
                  onMaxChange={(value) =>
                    onTrainingPlanFiltersChange({
                      ...trainingPlanFilters,
                      maxSessionsPerWeek: parseNumericInput(value),
                    })
                  }
                  minPlaceholder="Min sessions"
                  maxPlaceholder="Max sessions"
                  unitLabel="sessions per week"
                  testIDPrefix="discover-filter-trainingPlans-sessions"
                />
              </FilterSection>
            </View>
          ) : null}

          {showRouteFilters ? (
            <View className="mt-4 gap-3">
              <FilterSection title="Sort">
                <SortFieldSelector
                  options={[
                    {
                      label: "Created",
                      value: "created_at",
                      testID: "discover-filter-sort-field-created-at",
                    },
                    {
                      label: "Distance",
                      value: "distance",
                      testID: "discover-filter-sort-field-distance",
                    },
                    {
                      label: "Ascent",
                      value: "ascent",
                      testID: "discover-filter-sort-field-ascent",
                    },
                  ]}
                  value={routeSort.field}
                  onChange={(value) =>
                    onRouteSortChange({ ...routeSort, field: value as RouteSortField })
                  }
                />
                <DirectionToggle
                  direction={routeSort.direction}
                  onChange={(direction) => onRouteSortChange({ ...routeSort, direction })}
                />
              </FilterSection>

              <FilterSection title="Route type">
                <View className="flex-row flex-wrap gap-2">
                  {ACTIVITY_CATEGORY_OPTIONS.map((category) => (
                    <FilterChip
                      key={category.id}
                      label={category.label}
                      isActive={routeFilters.categoryIds.includes(category.id)}
                      onPress={() =>
                        onRouteFiltersChange({
                          ...routeFilters,
                          categoryIds: routeFilters.categoryIds.includes(category.id)
                            ? routeFilters.categoryIds.filter((id) => id !== category.id)
                            : [...routeFilters.categoryIds, category.id],
                        })
                      }
                      testID={`discover-filter-routes-category-${category.id}`}
                    />
                  ))}
                </View>
              </FilterSection>

              <FilterSection title="Distance">
                <RangeInputRow
                  minValue={routeFilters.minDistanceKm}
                  maxValue={routeFilters.maxDistanceKm}
                  onMinChange={(value) =>
                    onRouteFiltersChange({
                      ...routeFilters,
                      minDistanceKm: parseNumericInput(value, { allowDecimal: true }),
                    })
                  }
                  onMaxChange={(value) =>
                    onRouteFiltersChange({
                      ...routeFilters,
                      maxDistanceKm: parseNumericInput(value, { allowDecimal: true }),
                    })
                  }
                  minPlaceholder="Min km"
                  maxPlaceholder="Max km"
                  keyboardType="decimal-pad"
                  unitLabel="kilometers"
                  testIDPrefix="discover-filter-routes-distance"
                />
              </FilterSection>

              <FilterSection title="Ascent">
                <RangeInputRow
                  minValue={routeFilters.minAscentM}
                  maxValue={routeFilters.maxAscentM}
                  onMinChange={(value) =>
                    onRouteFiltersChange({
                      ...routeFilters,
                      minAscentM: parseNumericInput(value),
                    })
                  }
                  onMaxChange={(value) =>
                    onRouteFiltersChange({
                      ...routeFilters,
                      maxAscentM: parseNumericInput(value),
                    })
                  }
                  minPlaceholder="Min ascent m"
                  maxPlaceholder="Max ascent m"
                  unitLabel="meters"
                  testIDPrefix="discover-filter-routes-ascent"
                />
              </FilterSection>
            </View>
          ) : null}

          {scope === "users" ? (
            <View className="mt-4 gap-3">
              <FilterSection title="Sort">
                <SortFieldSelector
                  options={[
                    {
                      label: "Created",
                      value: "created_at",
                      testID: "discover-filter-sort-field-created-at",
                    },
                    {
                      label: "Username",
                      value: "username",
                      testID: "discover-filter-sort-field-username",
                    },
                  ]}
                  value={profileSort.field}
                  onChange={(value) =>
                    onProfileSortChange({ ...profileSort, field: value as ProfileSortField })
                  }
                />
                <DirectionToggle
                  direction={profileSort.direction}
                  onChange={(direction) => onProfileSortChange({ ...profileSort, direction })}
                />
              </FilterSection>
            </View>
          ) : null}
        </BottomSheetScrollView>

        <View className="border-t border-border bg-background px-4 pb-8 pt-3">
          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={onReset}
              activeOpacity={0.85}
              disabled={isResetDisabled}
              testID="discover-filter-reset"
              className={`flex-1 items-center justify-center rounded-2xl border px-4 py-3 ${
                isResetDisabled ? "border-border bg-muted/40" : "border-border bg-background"
              }`}
            >
              <Text className="text-sm font-medium text-foreground">Reset</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onApply}
              activeOpacity={0.85}
              disabled={validationErrors.length > 0}
              testID="discover-filter-apply"
              className={`flex-1 items-center justify-center rounded-2xl px-4 py-3 ${
                validationErrors.length > 0 ? "bg-muted" : "bg-primary"
              }`}
            >
              <Text
                className={`text-sm font-semibold ${
                  validationErrors.length > 0 ? "text-muted-foreground" : "text-primary-foreground"
                }`}
              >
                Apply
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-2.5 rounded-2xl border border-border/70 bg-card/60 px-3 py-3">
      <Text className="text-sm font-semibold text-foreground">{title}</Text>
      {children}
    </View>
  );
}

function SegmentedControl({
  options,
  value,
  onChange,
}: {
  options: Array<{ label: string; value: string; testID?: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View className="flex-row rounded-xl border border-border/80 bg-muted/35 p-1">
      {options.map((option) => {
        const isActive = option.value === value;

        return (
          <TouchableOpacity
            key={option.value}
            onPress={() => onChange(option.value)}
            activeOpacity={0.85}
            testID={option.testID}
            className={`flex-1 items-center justify-center rounded-lg px-3 py-2 ${
              isActive ? "bg-background" : "bg-transparent"
            }`}
          >
            <Text
              className={`text-xs font-semibold ${
                isActive ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function SortFieldSelector({
  options,
  value,
  onChange,
}: {
  options: Array<{ label: string; value: string; testID?: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View className="gap-2">
      <Text className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Sort field
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => (
          <FilterChip
            key={option.value}
            label={option.label}
            isActive={value === option.value}
            onPress={() => onChange(option.value)}
            testID={option.testID}
          />
        ))}
      </View>
    </View>
  );
}

function DirectionToggle({
  direction,
  onChange,
}: {
  direction: SortDirection;
  onChange: (direction: SortDirection) => void;
}) {
  return (
    <View className="gap-2">
      <Text className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Direction
      </Text>
      <SegmentedControl
        options={[
          { label: "Ascending", value: "asc", testID: "discover-filter-sort-direction-asc" },
          { label: "Descending", value: "desc", testID: "discover-filter-sort-direction-desc" },
        ]}
        value={direction}
        onChange={(value) => onChange(value as SortDirection)}
      />
    </View>
  );
}

function RangeInputRow({
  minValue,
  maxValue,
  onMinChange,
  onMaxChange,
  minPlaceholder,
  maxPlaceholder,
  unitLabel,
  testIDPrefix,
  keyboardType = "numeric",
}: {
  minValue: number | null;
  maxValue: number | null;
  onMinChange: (value: string) => void;
  onMaxChange: (value: string) => void;
  minPlaceholder: string;
  maxPlaceholder: string;
  unitLabel?: string;
  testIDPrefix: string;
  keyboardType?: "numeric" | "decimal-pad";
}) {
  return (
    <View className="gap-2">
      {unitLabel ? <Text className="text-[11px] text-muted-foreground">{unitLabel}</Text> : null}
      <View className="flex-row gap-2.5">
        <View className="flex-1 gap-1.5">
          <Text className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Min
          </Text>
          <Input
            value={minValue?.toString() ?? ""}
            onChangeText={onMinChange}
            placeholder={minPlaceholder}
            keyboardType={keyboardType}
            testID={`${testIDPrefix}-min`}
            className="h-10 rounded-lg border border-border/80 bg-background px-3 text-sm text-foreground"
          />
        </View>
        <View className="flex-1 gap-1.5">
          <Text className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Max
          </Text>
          <Input
            value={maxValue?.toString() ?? ""}
            onChangeText={onMaxChange}
            placeholder={maxPlaceholder}
            keyboardType={keyboardType}
            testID={`${testIDPrefix}-max`}
            className="h-10 rounded-lg border border-border/80 bg-background px-3 text-sm text-foreground"
          />
        </View>
      </View>
      <Text className="text-[11px] text-muted-foreground">Leave blank to keep the range open.</Text>
    </View>
  );
}

interface TrainingPlanCardProps {
  template: any;
  onPress: () => void;
}

function TrainingPlanCard({ template, onPress }: TrainingPlanCardProps) {
  return (
    <SharedTrainingPlanCard
      plan={template}
      onPress={onPress}
      variant="compact"
      headerAccessory={<Icon as={ChevronRight} size={18} className="mt-1 text-muted-foreground" />}
    />
  );
}

interface RouteCardProps {
  route: any;
  onPress: () => void;
}

function RouteCard({ route, onPress }: RouteCardProps) {
  return (
    <SharedRouteCard
      route={route}
      onPress={onPress}
      variant="compact"
      showAttribution={false}
      headerAccessory={<Icon as={ChevronRight} size={18} className="mt-1 text-muted-foreground" />}
    />
  );
}

interface UserCardProps {
  user: any;
  onPress: () => void;
}

function UserCard({ user, onPress }: UserCardProps) {
  const username = user.username || "User";
  const visibilityLabel = user.is_public ? "Public profile" : "Private profile";
  const description = user.is_public
    ? "Open profile to view their public details and follow status."
    : "Open profile to request access or follow them privately.";

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      testID={`discover-user-${user.id}`}
      className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-4"
    >
      <Avatar alt={username} className="h-14 w-14">
        <AvatarImage source={{ uri: user.avatar_url }} />
        <AvatarFallback>
          <Text className="text-base font-medium text-foreground">
            {username.slice(0, 2).toUpperCase()}
          </Text>
        </AvatarFallback>
      </Avatar>
      <View className="flex-1 gap-1">
        <View className="flex-row items-center gap-2">
          <Text className="text-base font-semibold text-foreground">{username}</Text>
          <View className="rounded-full bg-muted px-2 py-0.5">
            <Text className="text-[11px] font-medium text-muted-foreground">{visibilityLabel}</Text>
          </View>
        </View>
        <Text className="text-sm leading-5 text-muted-foreground">{description}</Text>
        <Text className="text-xs font-medium text-primary">Open profile</Text>
      </View>
      <Icon as={ChevronRight} size={18} className="text-muted-foreground" />
    </TouchableOpacity>
  );
}
