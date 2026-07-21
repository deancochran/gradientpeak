import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { createFileRoute } from "@tanstack/react-router";
import { Import, Search } from "lucide-react";
import { type FormEvent, useState } from "react";
import {
  ActivityListCard,
  DetailPageIntro,
} from "../../../components/protected/activity-route-primitives";
import { api } from "../../../lib/api/client";

type ActivityHistorySearch = {
  q?: string;
  category?: "run" | "bike" | "swim" | "strength" | "other";
  sort?: "date" | "distance" | "duration" | "tss";
  order?: "asc" | "desc";
  from?: string;
  to?: string;
};

const CATEGORIES = ["run", "bike", "swim", "strength", "other"] as const;
const SORTS = ["date", "distance", "duration", "tss"] as const;

export function validateActivityHistorySearch(
  search: Record<string, unknown>,
): ActivityHistorySearch {
  const q = typeof search.q === "string" ? search.q.trim().slice(0, 80) : "";
  const category = CATEGORIES.find((value) => value === search.category);
  const sort = SORTS.find((value) => value === search.sort);
  return {
    ...(q ? { q } : {}),
    ...(category !== undefined ? { category } : {}),
    ...(sort !== undefined ? { sort } : {}),
    ...(search.order === "asc" || search.order === "desc" ? { order: search.order } : {}),
    ...(typeof search.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(search.from)
      ? { from: search.from }
      : {}),
    ...(typeof search.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(search.to)
      ? { to: search.to }
      : {}),
  };
}

export const Route = createFileRoute("/_protected/activities/")({
  component: ActivitiesPage,
  validateSearch: validateActivityHistorySearch,
});

function ActivitiesPage() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  const [query, setQuery] = useState(search.q ?? "");
  const activitiesQuery = api.activities.listPaginated.useInfiniteQuery(
    {
      limit: 20,
      sort_by: search.sort ?? "date",
      sort_order: search.order ?? "desc",
      search: search.q,
      activity_category: search.category,
      date_from: search.from ? `${search.from}T00:00:00.000Z` : undefined,
      date_to: search.to ? `${search.to}T23:59:59.999Z` : undefined,
    },
    { getNextPageParam: (lastPage) => lastPage.nextCursor },
  );
  const activities = activitiesQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const total = activitiesQuery.data?.pages[0]?.total ?? 0;
  const updateSearch = (
    updates: Partial<ActivityHistorySearch>,
    removals: Array<keyof ActivityHistorySearch> = [],
  ) =>
    void navigate({
      search: (current) => {
        const next = { ...current, ...updates };
        for (const key of removals) delete next[key];
        return next;
      },
    });
  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const nextQuery = query.trim();
    updateSearch(nextQuery ? { q: nextQuery } : {}, nextQuery ? [] : ["q"]);
  };

  return (
    <div className="container mx-auto max-w-6xl space-y-6 py-4">
      <DetailPageIntro
        actions={
          <Button onClick={() => void navigate({ to: "/activities/import" })} type="button">
            <Import className="mr-2 h-4 w-4" />
            Import activity
          </Button>
        }
        description="Completed activities, manual imports, and links into deeper effort analysis."
        eyebrow="Activity history"
        title="Activities"
      />

      <Card>
        <CardHeader>
          <CardTitle>Search and filter</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="flex gap-2" onSubmit={submitSearch}>
            <label className="flex-1" htmlFor="activity-history-search">
              <span className="sr-only">Search activities</span>
              <Input
                id="activity-history-search"
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="Search activity names and notes"
                value={query}
              />
            </label>
            <Button type="submit" variant="outline">
              <Search className="mr-2 h-4 w-4" />
              Search
            </Button>
          </form>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <FilterSelect
              label="Sport"
              onChange={(value) => {
                const category = CATEGORIES.find((candidate) => candidate === value);
                updateSearch(category ? { category } : {}, category ? [] : ["category"]);
              }}
              value={search.category ?? ""}
              options={[
                { value: "", label: "All sports" },
                ...CATEGORIES.map((value) => ({
                  value,
                  label: value[0]?.toUpperCase() + value.slice(1),
                })),
              ]}
            />
            <FilterSelect
              label="Sort by"
              onChange={(value) => {
                const sort = SORTS.find((candidate) => candidate === value);
                updateSearch(sort ? { sort } : {}, sort ? [] : ["sort"]);
              }}
              value={search.sort ?? "date"}
              options={SORTS.map((value) => ({
                value,
                label: value[0]?.toUpperCase() + value.slice(1),
              }))}
            />
            <FilterSelect
              label="Order"
              onChange={(value) => updateSearch({ order: value as "asc" | "desc" })}
              value={search.order ?? "desc"}
              options={[
                { value: "desc", label: "Descending" },
                { value: "asc", label: "Ascending" },
              ]}
            />
            <label className="space-y-1 text-sm" htmlFor="activity-history-from">
              <span>From</span>
              <Input
                id="activity-history-from"
                onChange={(event) => {
                  const from = event.currentTarget.value;
                  updateSearch(from ? { from } : {}, from ? [] : ["from"]);
                }}
                type="date"
                value={search.from ?? ""}
              />
            </label>
            <label className="space-y-1 text-sm" htmlFor="activity-history-to">
              <span>To</span>
              <Input
                id="activity-history-to"
                onChange={(event) => {
                  const to = event.currentTarget.value;
                  updateSearch(to ? { to } : {}, to ? [] : ["to"]);
                }}
                type="date"
                value={search.to ?? ""}
              />
            </label>
          </div>
          <Button
            onClick={() => {
              setQuery("");
              void navigate({ search: {} });
            }}
            type="button"
            variant="ghost"
          >
            Clear filters
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{total} saved activities</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {activitiesQuery.isLoading ? (
            <p aria-live="polite" className="py-10 text-center text-muted-foreground">
              Loading activity history…
            </p>
          ) : null}
          {activitiesQuery.isError ? (
            <div className="space-y-3 py-8 text-center" role="alert">
              <p>Activity history could not be loaded.</p>
              <Button
                onClick={() => void activitiesQuery.refetch()}
                type="button"
                variant="outline"
              >
                Try again
              </Button>
            </div>
          ) : null}
          {!activitiesQuery.isLoading && !activitiesQuery.isError && activities.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center text-muted-foreground">
              No activities match these filters.
            </div>
          ) : null}
          {!activitiesQuery.isError
            ? activities.map((activity) => (
                <ActivityListCard
                  key={activity.id}
                  activity={activity}
                  onOpen={() =>
                    void navigate({
                      to: "/activities/$activityId",
                      params: { activityId: activity.id },
                    })
                  }
                />
              ))
            : null}
          {activitiesQuery.hasNextPage ? (
            <div className="flex justify-center">
              <Button
                disabled={activitiesQuery.isFetchingNextPage}
                onClick={() => void activitiesQuery.fetchNextPage()}
                type="button"
                variant="outline"
              >
                {activitiesQuery.isFetchingNextPage ? "Loading more..." : "Load more activities"}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1 text-sm">
      <span>{label}</span>
      <select
        className="h-10 w-full rounded-md border border-input bg-background px-3"
        onChange={(event) => onChange(event.currentTarget.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
