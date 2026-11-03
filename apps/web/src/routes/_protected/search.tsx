import { Badge } from "@repo/ui/components/badge";
import { createFileRoute } from "@tanstack/react-router";
import { Compass } from "lucide-react";

import {
  DiscoveryExplorer,
  type WebDiscoverScope,
} from "../../components/discover/discovery-explorer";

const DISCOVERY_SCOPES = new Set<WebDiscoverScope>([
  "activityPlans",
  "trainingPlans",
  "routes",
  "users",
  "groups",
]);
const ACTIVITY_CATEGORIES = new Set(["run", "bike", "swim", "strength", "other"]);
const ACTIVITY_PLAN_SORTS = new Set(["newest", "oldest"]);
const TRAINING_PLAN_SORTS = new Set([
  "newest",
  "oldest",
  "duration_desc",
  "duration_asc",
  "sessions_desc",
  "sessions_asc",
]);
const ROUTE_SORTS = new Set(["newest", "oldest", "distance_desc", "distance_asc"]);
const PROFILE_SORTS = new Set(["newest", "oldest", "username_asc", "username_desc"]);
const EXPERIENCE_LEVELS = new Set(["beginner", "intermediate", "advanced"]);

type DiscoverySearch = {
  q?: string;
  scope?: WebDiscoverScope;
  minDistanceKm?: string;
  maxDistanceKm?: string;
  activityCategory?: string;
  activitySort?: string;
  trainingPlanCategory?: string;
  experience?: string;
  routeSort?: string;
  profileSort?: string;
  trainingSort?: string;
};

export const Route = createFileRoute("/_protected/search")({
  validateSearch: (search: Record<string, unknown>): DiscoverySearch => {
    const minDistanceKm = optionalNonnegativeNumber(search.minDistanceKm);
    const maxDistanceKm = optionalNonnegativeNumber(search.maxDistanceKm);
    return {
      ...(typeof search.q === "string" ? { q: search.q.slice(0, 80) } : {}),
      ...(typeof search.scope === "string" && DISCOVERY_SCOPES.has(search.scope as WebDiscoverScope)
        ? { scope: search.scope as WebDiscoverScope }
        : {}),
      ...(minDistanceKm !== undefined &&
      maxDistanceKm !== undefined &&
      minDistanceKm > maxDistanceKm
        ? {}
        : {
            ...(minDistanceKm !== undefined ? { minDistanceKm: String(minDistanceKm) } : {}),
            ...(maxDistanceKm !== undefined ? { maxDistanceKm: String(maxDistanceKm) } : {}),
          }),
      ...optionalSetValue(search.activityCategory, ACTIVITY_CATEGORIES, "activityCategory"),
      ...optionalSetValue(search.trainingPlanCategory, ACTIVITY_CATEGORIES, "trainingPlanCategory"),
      ...optionalSetValue(search.experience, EXPERIENCE_LEVELS, "experience"),
      ...optionalSetValue(search.activitySort, ACTIVITY_PLAN_SORTS, "activitySort"),
      ...optionalSetValue(search.trainingSort, TRAINING_PLAN_SORTS, "trainingSort"),
      ...optionalSetValue(search.routeSort, ROUTE_SORTS, "routeSort"),
      ...optionalSetValue(search.profileSort, PROFILE_SORTS, "profileSort"),
    };
  },
  component: SearchPage,
});

function SearchPage() {
  const {
    activityCategory,
    activitySort,
    experience,
    maxDistanceKm,
    minDistanceKm,
    profileSort,
    q,
    routeSort,
    scope,
    trainingPlanCategory,
    trainingSort,
  } = Route.useSearch();
  return (
    <div className="space-y-6">
      <header>
        <div className="mb-2 flex items-center gap-2">
          <Compass className="h-5 w-5" />
          <Badge variant="outline">Discover</Badge>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Discover training, routes, profiles, and groups
        </h1>
        <p className="mt-2 text-muted-foreground">
          Search persisted activity plans, training plans, routes, profiles, and groups.
        </p>
      </header>
      <DiscoveryExplorer
        initialMaxDistanceKm={maxDistanceKm ?? ""}
        initialMinDistanceKm={minDistanceKm ?? ""}
        initialQuery={q ?? ""}
        initialActivityCategory={activityCategory ?? ""}
        initialActivitySort={activitySort ?? "newest"}
        initialExperience={experience ?? ""}
        initialProfileSort={profileSort ?? "newest"}
        initialRouteSort={routeSort ?? "newest"}
        initialTrainingPlanCategory={trainingPlanCategory ?? ""}
        initialTrainingSort={trainingSort ?? "newest"}
        {...(scope ? { initialScope: scope } : {})}
      />
    </div>
  );
}

function optionalNonnegativeNumber(value: unknown) {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function optionalSetValue(value: unknown, values: Set<string>, key: string) {
  return typeof value === "string" && values.has(value) ? { [key]: value } : {};
}
