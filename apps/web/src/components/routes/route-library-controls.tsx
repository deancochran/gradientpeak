import { BoundedNumberInput } from "@repo/ui/components/bounded-number-input";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { useEffect, useState } from "react";

export const routeSortValues = [
  "newest",
  "oldest",
  "distance_desc",
  "distance_asc",
  "ascent_desc",
  "ascent_asc",
] as const;

export type RouteSort = (typeof routeSortValues)[number];
export type RouteOwnerScope = "own" | "public" | "system" | "all";

export type RouteLibraryFilters = {
  search: string;
  ownerScope: RouteOwnerScope;
  sort: RouteSort;
  minDistanceKm: string;
  maxDistanceKm: string;
  minAscentM: string;
  maxAscentM: string;
};

export function parseOptionalNonnegativeNumber(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? String(value) : "";
}

export function RouteLibraryControls({
  filters,
  onChange,
  onClear,
}: {
  filters: RouteLibraryFilters;
  onChange: (filters: RouteLibraryFilters) => void;
  onClear: () => void;
}) {
  const [numberDrafts, setNumberDrafts] = useState({
    maxAscentM: filters.maxAscentM,
    maxDistanceKm: filters.maxDistanceKm,
    minAscentM: filters.minAscentM,
    minDistanceKm: filters.minDistanceKm,
  });
  const [hasPendingNumberDrafts, setHasPendingNumberDrafts] = useState(false);
  const numberErrors = getRouteNumberErrors(numberDrafts);

  useEffect(() => {
    const appliedMatchesDraft =
      filters.maxAscentM === numberDrafts.maxAscentM &&
      filters.maxDistanceKm === numberDrafts.maxDistanceKm &&
      filters.minAscentM === numberDrafts.minAscentM &&
      filters.minDistanceKm === numberDrafts.minDistanceKm;
    if (hasPendingNumberDrafts && appliedMatchesDraft) {
      setHasPendingNumberDrafts(false);
      return;
    }
    if (!hasPendingNumberDrafts && !appliedMatchesDraft) {
      setNumberDrafts({
        maxAscentM: filters.maxAscentM,
        maxDistanceKm: filters.maxDistanceKm,
        minAscentM: filters.minAscentM,
        minDistanceKm: filters.minDistanceKm,
      });
    }
  }, [
    filters.maxAscentM,
    filters.maxDistanceKm,
    filters.minAscentM,
    filters.minDistanceKm,
    hasPendingNumberDrafts,
  ]);

  const update = <TKey extends keyof RouteLibraryFilters>(
    key: TKey,
    value: RouteLibraryFilters[TKey],
  ) => onChange({ ...filters, [key]: value });
  const updateNumberDraft = (key: keyof typeof numberDrafts, value: string) => {
    setHasPendingNumberDrafts(true);
    setNumberDrafts((drafts) => ({ ...drafts, [key]: value }));
  };
  const applyNumberDrafts = () => {
    if (numberErrors.length > 0) return;
    onChange({ ...filters, ...numberDrafts });
  };

  return (
    <fieldset className="min-w-0 space-y-4 border-0 p-0">
      <legend className="sr-only">Route library filters</legend>
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr_1fr]">
        <label className="space-y-2 text-sm font-medium" htmlFor="route-library-search">
          <span>Search routes</span>
          <Input
            aria-label="Search routes"
            id="route-library-search"
            onChange={(event) => update("search", event.target.value)}
            placeholder="Name or description"
            type="search"
            value={filters.search}
          />
        </label>
        <label className="space-y-2 text-sm font-medium">
          <span>Library</span>
          <select
            aria-label="Route library"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            onChange={(event) => update("ownerScope", event.target.value as RouteOwnerScope)}
            value={filters.ownerScope}
          >
            <option value="own">My routes</option>
            <option value="all">All accessible</option>
            <option value="public">Public routes</option>
            <option value="system">System routes</option>
          </select>
        </label>
        <label className="space-y-2 text-sm font-medium">
          <span>Sort by</span>
          <select
            aria-label="Sort routes"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            onChange={(event) => update("sort", event.target.value as RouteSort)}
            value={filters.sort}
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="distance_desc">Longest distance</option>
            <option value="distance_asc">Shortest distance</option>
            <option value="ascent_desc">Most ascent</option>
            <option value="ascent_asc">Least ascent</option>
          </select>
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <NumberFilter
          id="route-min-distance"
          label="Minimum distance (km)"
          value={numberDrafts.minDistanceKm}
          onChange={(value) => updateNumberDraft("minDistanceKm", value)}
          adjustmentStep={0.1}
          decimals={3}
        />
        <NumberFilter
          id="route-max-distance"
          label="Maximum distance (km)"
          value={numberDrafts.maxDistanceKm}
          onChange={(value) => updateNumberDraft("maxDistanceKm", value)}
          adjustmentStep={0.1}
          decimals={3}
        />
        <NumberFilter
          id="route-min-ascent"
          label="Minimum ascent (m)"
          value={numberDrafts.minAscentM}
          onChange={(value) => updateNumberDraft("minAscentM", value)}
          adjustmentStep={10}
          decimals={0}
        />
        <NumberFilter
          id="route-max-ascent"
          label="Maximum ascent (m)"
          value={numberDrafts.maxAscentM}
          onChange={(value) => updateNumberDraft("maxAscentM", value)}
          adjustmentStep={10}
          decimals={0}
        />
      </div>
      {hasPendingNumberDrafts ? (
        <p className="text-sm text-muted-foreground" role="status">
          Numeric filter edits have not been applied.
        </p>
      ) : null}
      {numberErrors.length > 0 ? <p role="alert">{numberErrors[0]}</p> : null}
      <div className="flex justify-end gap-3">
        <Button onClick={applyNumberDrafts} type="button">
          Apply filters
        </Button>
        <Button
          onClick={() => {
            setHasPendingNumberDrafts(false);
            setNumberDrafts({
              maxAscentM: "",
              maxDistanceKm: "",
              minAscentM: "",
              minDistanceKm: "",
            });
            onClear();
          }}
          type="button"
          variant="ghost"
        >
          Clear filters
        </Button>
      </div>
    </fieldset>
  );
}

function getRouteNumberErrors(drafts: {
  minDistanceKm: string;
  maxDistanceKm: string;
  minAscentM: string;
  maxAscentM: string;
}) {
  const values = Object.entries(drafts).map(([key, value]) => [key, value.trim()] as const);
  for (const [key, value] of values) {
    if (value && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
      return [
        `${routeNumberLabels[key as keyof typeof routeNumberLabels]} must be a non-negative number.`,
      ];
    }
  }
  if (
    drafts.minDistanceKm &&
    drafts.maxDistanceKm &&
    Number(drafts.minDistanceKm) > Number(drafts.maxDistanceKm)
  ) {
    return ["Minimum distance cannot exceed maximum distance."];
  }
  if (
    drafts.minAscentM &&
    drafts.maxAscentM &&
    Number(drafts.minAscentM) > Number(drafts.maxAscentM)
  ) {
    return ["Minimum ascent cannot exceed maximum ascent."];
  }
  return [];
}

const routeNumberLabels = {
  maxAscentM: "Maximum ascent",
  maxDistanceKm: "Maximum distance",
  minAscentM: "Minimum ascent",
  minDistanceKm: "Minimum distance",
};

function NumberFilter({
  id,
  label,
  onChange,
  adjustmentStep,
  decimals,
  value,
}: {
  id: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
  adjustmentStep: number;
  decimals: number;
}) {
  return (
    <BoundedNumberInput
      adjustmentStep={adjustmentStep}
      decimals={decimals}
      id={id}
      label={label}
      max={Number.MAX_SAFE_INTEGER}
      min={0}
      onChange={onChange}
      showAdjustmentButtons
      value={value}
    />
  );
}
