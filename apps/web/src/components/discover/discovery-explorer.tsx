import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useState } from "react";

import { api } from "../../lib/api/client";

export type WebDiscoverScope = "activityPlans" | "trainingPlans" | "routes" | "users" | "groups";

const SCOPES: Array<{ id: WebDiscoverScope; label: string }> = [
  { id: "activityPlans", label: "Activity plans" },
  { id: "trainingPlans", label: "Training plans" },
  { id: "routes", label: "Routes" },
  { id: "users", label: "Profiles" },
  { id: "groups", label: "Groups" },
];

type DiscoveryItem = {
  id: string;
  name?: string | null;
  full_name?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  description?: string | null;
  primary_category?: string | null;
  total_distance?: number | null;
  sessions_per_week_target?: number | null;
  member_count?: number | null;
};

type QueryState = {
  data?: { pages: Array<{ items?: DiscoveryItem[]; users?: DiscoveryItem[] }> };
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  isFetchingNextPage: boolean;
  hasNextPage?: boolean;
  refetch: () => Promise<unknown>;
  fetchNextPage: () => Promise<unknown>;
};

export function DiscoveryExplorer({ initialQuery = "" }: { initialQuery?: string }) {
  const [scope, setScope] = useState<WebDiscoverScope>("activityPlans");
  const [draftSearch, setDraftSearch] = useState(initialQuery);
  const [search, setSearch] = useState(initialQuery.trim());
  const [category, setCategory] = useState("");
  const [activitySort, setActivitySort] = useState("newest");
  const [sport, setSport] = useState("");
  const [experience, setExperience] = useState("");
  const [routeSort, setRouteSort] = useState("newest");
  const [profileSort, setProfileSort] = useState("newest");
  const [trainingSort, setTrainingSort] = useState("newest");
  const [minDistance, setMinDistance] = useState("");
  const [maxDistance, setMaxDistance] = useState("");

  const activityPlans = api.activityPlans.list.useInfiniteQuery(
    {
      ownerScope: "discoverable",
      includeOwnOnly: false,
      includeSystemTemplates: true,
      includeEstimation: true,
      search: search || undefined,
      activityCategory: category
        ? (category as "run" | "bike" | "swim" | "strength" | "other")
        : undefined,
      sort_by: activitySort as "newest" | "oldest",
      limit: 20,
    },
    { enabled: scope === "activityPlans", getNextPageParam: (page) => page.nextCursor },
  );
  const trainingPlans = api.trainingPlans.listTemplates.useInfiniteQuery(
    {
      search: search || undefined,
      sport: sport || undefined,
      experience_level: experience
        ? (experience as "beginner" | "intermediate" | "advanced")
        : undefined,
      sort_by: trainingSort as
        | "newest"
        | "oldest"
        | "duration_desc"
        | "duration_asc"
        | "sessions_desc"
        | "sessions_asc",
      limit: 20,
    },
    { enabled: scope === "trainingPlans", getNextPageParam: (page) => page.nextCursor },
  );
  const routes = api.routes.list.useInfiniteQuery(
    {
      ownerScope: "all",
      search: search || undefined,
      min_distance_m: minDistance ? Number(minDistance) * 1000 : undefined,
      max_distance_m: maxDistance ? Number(maxDistance) * 1000 : undefined,
      sort_by: routeSort as "newest" | "oldest" | "distance_desc" | "distance_asc",
      limit: 20,
    },
    { enabled: scope === "routes", getNextPageParam: (page) => page.nextCursor },
  );
  const users = api.social.searchUsers.useInfiniteQuery(
    {
      query: search || undefined,
      sort_by: profileSort as "newest" | "oldest" | "username_asc" | "username_desc",
      limit: 20,
    },
    { enabled: scope === "users", getNextPageParam: (page) => page.nextCursor },
  );
  const groups = api.groups.listDiscoverable.useInfiniteQuery(
    { search: search || undefined, sort_by: profileSort as "newest" | "oldest", limit: 20 },
    { enabled: scope === "groups", getNextPageParam: (page) => page.nextCursor ?? undefined },
  );

  const activeQuery = { activityPlans, trainingPlans, routes, users, groups }[scope] as QueryState;
  const pages = activeQuery.data?.pages ?? [];
  const items = pages.flatMap((page) =>
    scope === "users" ? (page.users ?? []) : (page.items ?? []),
  );
  const noun = SCOPES.find((item) => item.id === scope)?.label.toLowerCase() ?? "results";

  const resetScopeFilters = () => {
    setCategory("");
    setActivitySort("newest");
    setSport("");
    setExperience("");
    setRouteSort("newest");
    setProfileSort("newest");
    setTrainingSort("newest");
    setMinDistance("");
    setMaxDistance("");
  };

  return (
    <div className="space-y-6">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setSearch(draftSearch.trim());
        }}
      >
        <Input
          aria-label={`Search ${noun}`}
          value={draftSearch}
          maxLength={80}
          onChange={(event) => setDraftSearch(event.target.value)}
        />
        <Button type="submit">
          <Search className="mr-2 h-4 w-4" />
          Search
        </Button>
      </form>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Discovery scopes">
        {SCOPES.map((option) => (
          <Button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={scope === option.id}
            variant={scope === option.id ? "default" : "outline"}
            onClick={() => {
              setScope(option.id);
              resetScopeFilters();
            }}
          >
            {option.label}
          </Button>
        ))}
      </div>

      <fieldset className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
        <legend className="sr-only">{noun} filters</legend>
        {scope === "activityPlans" ? (
          <>
            <Select
              label="Activity category"
              value={category}
              onChange={setCategory}
              options={["run", "bike", "swim", "strength", "other"]}
            />
            <Select
              label="Sort activity plans"
              value={activitySort}
              onChange={setActivitySort}
              options={["newest", "oldest"]}
              allowAny={false}
            />
          </>
        ) : null}
        {scope === "trainingPlans" ? (
          <>
            <Select
              label="Sport"
              value={sport}
              onChange={setSport}
              options={["run", "bike", "swim", "strength", "other"]}
            />
            <Select
              label="Experience"
              value={experience}
              onChange={setExperience}
              options={["beginner", "intermediate", "advanced"]}
            />
            <Select
              label="Sort training plans"
              value={trainingSort}
              onChange={setTrainingSort}
              options={[
                "newest",
                "oldest",
                "duration_desc",
                "duration_asc",
                "sessions_desc",
                "sessions_asc",
              ]}
              allowAny={false}
            />
          </>
        ) : null}
        {scope === "routes" ? (
          <>
            <NumberFilter
              label="Minimum distance (km)"
              value={minDistance}
              onChange={setMinDistance}
            />
            <NumberFilter
              label="Maximum distance (km)"
              value={maxDistance}
              onChange={setMaxDistance}
            />
            <Select
              label="Sort routes"
              value={routeSort}
              onChange={setRouteSort}
              options={["newest", "oldest", "distance_desc", "distance_asc"]}
              allowAny={false}
            />
          </>
        ) : null}
        {scope === "users" ? (
          <Select
            label="Sort profiles"
            value={profileSort}
            onChange={setProfileSort}
            options={["newest", "oldest", "username_asc", "username_desc"]}
            allowAny={false}
          />
        ) : null}
        {scope === "groups" ? (
          <Select
            label="Sort groups"
            value={profileSort}
            onChange={setProfileSort}
            options={["newest", "oldest"]}
            allowAny={false}
          />
        ) : null}
        <Button type="button" variant="ghost" onClick={resetScopeFilters}>
          Reset filters
        </Button>
      </fieldset>

      {activeQuery.isLoading ? (
        <p role="status" className="py-8 text-muted-foreground">
          Loading {noun}...
        </p>
      ) : null}
      {activeQuery.isError && items.length === 0 ? (
        <Card role="alert">
          <CardContent className="space-y-3 py-8 text-center">
            <p>We could not load {noun}.</p>
            <Button type="button" onClick={() => void activeQuery.refetch()}>
              Retry {noun}
            </Button>
          </CardContent>
        </Card>
      ) : null}
      {!activeQuery.isLoading && !activeQuery.isError && items.length === 0 ? (
        <Card>
          <CardContent className="space-y-3 py-10 text-center text-muted-foreground">
            <p>No {noun} match your search and filters.</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDraftSearch("");
                setSearch("");
                resetScopeFilters();
              }}
            >
              Clear search and filters
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {items.length > 0 ? (
        <div
          className="grid gap-4 md:grid-cols-2"
          aria-busy={activeQuery.isFetching && !activeQuery.isFetchingNextPage}
        >
          {items.map((item) => (
            <DiscoveryCard key={item.id} scope={scope} item={item} />
          ))}
        </div>
      ) : null}

      {activeQuery.isError && items.length > 0 ? (
        <div role="alert" className="rounded-lg border border-destructive/40 p-3">
          More {noun} could not be loaded.{" "}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void activeQuery.refetch()}
          >
            Retry
          </Button>
        </div>
      ) : null}
      {activeQuery.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            disabled={activeQuery.isFetchingNextPage}
            onClick={() => void activeQuery.fetchNextPage()}
          >
            {activeQuery.isFetchingNextPage ? "Loading more..." : `Load more ${noun}`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  allowAny = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  allowAny?: boolean;
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="block font-medium">{label}</span>
      <select
        className="h-10 rounded-md border bg-background px-3"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {allowAny ? <option value="">Any</option> : null}
        {options.map((option) => (
          <option key={option} value={option}>
            {option.replaceAll("_", " ")}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const inputId = `discover-${label.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`;
  return (
    <label className="space-y-1 text-sm" htmlFor={inputId}>
      <span className="block font-medium">{label}</span>
      <Input
        id={inputId}
        className="w-44"
        type="number"
        min="0"
        step="0.1"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function DiscoveryCard({ scope, item }: { scope: WebDiscoverScope; item: DiscoveryItem }) {
  const name = item.name ?? item.full_name ?? item.username ?? "Untitled";
  return (
    <Card data-testid={`discover-${scope}-${item.id}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-3 text-lg">
          {scope === "users" ? (
            <Avatar>
              <AvatarImage src={item.avatar_url ?? ""} alt="" />
              <AvatarFallback>{String(name).slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
          ) : null}
          <span>{scope === "users" && item.username ? `@${item.username}` : name}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        {item.description ? <p className="line-clamp-2">{item.description}</p> : null}
        {scope === "activityPlans" && item.primary_category ? (
          <Badge variant="secondary">{item.primary_category}</Badge>
        ) : null}
        {scope === "routes" ? (
          <p>
            {typeof item.total_distance === "number"
              ? `${(item.total_distance / 1000).toFixed(1)} km`
              : "Distance unavailable"}
          </p>
        ) : null}
        {scope === "trainingPlans" && item.sessions_per_week_target ? (
          <p>{item.sessions_per_week_target} sessions per week</p>
        ) : null}
        {scope === "groups" && item.member_count !== undefined ? (
          <p>{item.member_count} members</p>
        ) : null}
        {scope === "routes" ? (
          <Button asChild size="sm" variant="outline">
            <Link to="/routes/$routeId" params={{ routeId: item.id }}>
              View route
            </Link>
          </Button>
        ) : null}
        {scope === "users" ? (
          <Button asChild size="sm" variant="outline">
            <Link
              to="/user/$userId"
              params={{ userId: item.id }}
              search={{ flash: undefined, flashType: undefined }}
            >
              View profile
            </Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
