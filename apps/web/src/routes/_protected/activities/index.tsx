import { isValidDateOnlyUtc } from "@repo/core/calendar";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { createFileRoute } from "@tanstack/react-router";
import { Import } from "lucide-react";
import { useEffect, useState } from "react";
import {
  ActivityListCard,
  DetailPageIntro,
} from "../../../components/protected/activity-route-primitives";
import { api } from "../../../lib/api/client";
import { loadRouteQuery } from "../../../lib/api/route-loading";

type ActivityHistorySearch = {
  importRunId?: string;
  category?: "run" | "bike" | "swim" | "strength" | "other";
  sort?: "date" | "distance" | "duration";
  order?: "asc" | "desc";
  from?: string;
  to?: string;
};

const CATEGORIES = ["run", "bike", "swim", "strength", "other"] as const;
const SORTS = ["date", "distance", "duration"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateActivityHistorySearch(
  search: Record<string, unknown>,
): ActivityHistorySearch {
  const category = CATEGORIES.find((value) => value === search.category);
  const sort = SORTS.find((value) => value === search.sort);
  return {
    ...(typeof search.importRunId === "string" && UUID.test(search.importRunId)
      ? { importRunId: search.importRunId }
      : {}),
    ...(category !== undefined ? { category } : {}),
    ...(sort !== undefined ? { sort } : {}),
    ...(search.order === "asc" || search.order === "desc" ? { order: search.order } : {}),
    ...(typeof search.from === "string" && isValidDateOnlyUtc(search.from)
      ? { from: search.from }
      : {}),
    ...(typeof search.to === "string" && isValidDateOnlyUtc(search.to) ? { to: search.to } : {}),
  };
}

export const Route = createFileRoute("/_protected/activities/")({
  validateSearch: validateActivityHistorySearch,
  loaderDeps: ({ search }) => ({
    category: search.category,
    from: search.from,
    importRunId: search.importRunId,
    order: search.order,
    sort: search.sort,
    to: search.to,
  }),
  loader: ({ context, deps }) => {
    const input = getActivitiesInput(deps);
    return loadRouteQuery(
      () => context.apiUtils.activities.listPaginated.getInfiniteData(input),
      () => context.apiUtils.activities.listPaginated.fetchInfinite(input),
    );
  },
  component: ActivitiesPage,
});

function getActivitiesInput(search: ActivityHistorySearch) {
  return {
    limit: 20,
    importRunId: search.importRunId,
    sort_by: search.sort ?? "date",
    sort_order: search.order ?? "desc",
    activity_category: search.category,
    date_from: search.from ? `${search.from}T00:00:00.000Z` : undefined,
    date_to: search.to ? `${search.to}T23:59:59.999Z` : undefined,
  };
}

function ActivitiesPage() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  const [dateDraft, setDateDraft] = useState({ from: search.from ?? "", to: search.to ?? "" });
  const [hasPendingDateDraft, setHasPendingDateDraft] = useState(false);
  const dateError = getDateRangeError(dateDraft);
  useEffect(() => {
    const appliedMatchesDraft =
      (search.from ?? "") === dateDraft.from && (search.to ?? "") === dateDraft.to;
    if (hasPendingDateDraft && appliedMatchesDraft) {
      setHasPendingDateDraft(false);
      return;
    }
    if (!hasPendingDateDraft && !appliedMatchesDraft) {
      setDateDraft({ from: search.from ?? "", to: search.to ?? "" });
    }
  }, [dateDraft.from, dateDraft.to, hasPendingDateDraft, search.from, search.to]);
  const activitiesQuery = api.activities.listPaginated.useInfiniteQuery(
    getActivitiesInput(search),
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
  const applyDateDraft = () => {
    if (dateError) return;
    updateSearch(
      {
        ...(dateDraft.from ? { from: dateDraft.from } : {}),
        ...(dateDraft.to ? { to: dateDraft.to } : {}),
      },
      [...(dateDraft.from ? [] : (["from"] as const)), ...(dateDraft.to ? [] : (["to"] as const))],
    );
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
          <CardTitle>Filter activities</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <FilterSelect
              label="Activity category"
              onChange={(value) => {
                const category = CATEGORIES.find((candidate) => candidate === value);
                updateSearch(category ? { category } : {}, category ? [] : ["category"]);
              }}
              value={search.category ?? ""}
              options={[
                { value: "", label: "All activity categories" },
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
                  const value = event.currentTarget.value;
                  setHasPendingDateDraft(true);
                  setDateDraft((draft) => ({ ...draft, from: value }));
                }}
                type="date"
                value={dateDraft.from}
              />
            </label>
            <label className="space-y-1 text-sm" htmlFor="activity-history-to">
              <span>To</span>
              <Input
                id="activity-history-to"
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setHasPendingDateDraft(true);
                  setDateDraft((draft) => ({ ...draft, to: value }));
                }}
                type="date"
                value={dateDraft.to}
              />
            </label>
          </div>
          {hasPendingDateDraft ? (
            <p className="text-sm text-muted-foreground" role="status">
              Date filter edits have not been applied.
            </p>
          ) : null}
          {dateError ? <p role="alert">{dateError}</p> : null}
          <Button onClick={applyDateDraft} type="button">
            Apply dates
          </Button>
          <Button
            onClick={() => {
              setHasPendingDateDraft(false);
              setDateDraft({ from: "", to: "" });
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
          <CardTitle>
            {total} {search.importRunId ? "imported" : "saved"} activities
          </CardTitle>
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
              <div className="flex justify-center gap-2">
                <Button
                  onClick={() => void activitiesQuery.refetch()}
                  type="button"
                  variant="outline"
                >
                  Try again
                </Button>
                {search.sort || search.order ? (
                  <Button
                    onClick={() => updateSearch({}, ["sort", "order"])}
                    type="button"
                    variant="ghost"
                  >
                    Reset sort
                  </Button>
                ) : null}
              </div>
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
                  href={`/activities/${activity.id}`}
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

function getDateRangeError({ from, to }: { from: string; to: string }) {
  if (from && !isValidDateOnlyUtc(from)) return "From must be a valid calendar date.";
  if (to && !isValidDateOnlyUtc(to)) return "To must be a valid calendar date.";
  if (from && to && from > to) return "From date cannot be after To date.";
  return null;
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
