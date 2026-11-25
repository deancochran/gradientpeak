import { parseNumericInput } from "@repo/core/utils/numeric-ux-policy";
import { BoundedNumberInput } from "@repo/ui/components/bounded-number-input";
import { Button } from "@repo/ui/components/button";
import { Disclosure } from "@repo/ui/components/disclosure";
import { SearchField } from "@repo/ui/components/search-field";
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
  const [showNumberFilters, setShowNumberFilters] = useState(() =>
    Object.values(numberDrafts).some(Boolean),
  );
  const numberErrors = getRouteNumberErrors(numberDrafts);
  const appliedCount = numericFilters.filter(({ key }) => filters[key] !== "").length;

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
    numberDrafts.maxAscentM,
    numberDrafts.maxDistanceKm,
    numberDrafts.minAscentM,
    numberDrafts.minDistanceKm,
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
      <div className="grid grid-cols-2 items-end gap-3 lg:grid-cols-[2fr_1fr_1fr]">
        <div className="col-span-2 lg:col-span-1">
          <SearchField
            accessibilityLabel="Search routes"
            onValueChange={(value) => update("search", value)}
            placeholder="Name or description"
            value={filters.search}
          />
        </div>
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
      <Disclosure
        label={`Distance and ascent${appliedCount ? ` (${appliedCount} applied)` : ""}`}
        open={showNumberFilters}
        onOpenChange={setShowNumberFilters}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {numericFilters.map(({ key, id, unit, adjustmentStep, decimals }) => (
            <BoundedNumberInput
              key={key}
              id={id}
              label={`${routeNumberLabels[key]} (${unit})`}
              value={numberDrafts[key]}
              onChange={(value) => updateNumberDraft(key, value)}
              adjustmentStep={adjustmentStep}
              decimals={decimals}
              min={0}
              max={Number.MAX_SAFE_INTEGER}
              showAdjustmentButtons
            />
          ))}
        </div>
        <Button onClick={applyNumberDrafts} type="button">
          Apply filters
        </Button>
      </Disclosure>
      {hasPendingNumberDrafts ? (
        <p className="text-sm text-muted-foreground" role="status">
          Numeric filter edits have not been applied.
        </p>
      ) : null}
      {numberErrors.length > 0 ? <p role="alert">{numberErrors[0]}</p> : null}
      <div className="flex justify-end gap-3">
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
  for (const { key, decimals } of numericFilters) {
    const result = parseNumericInput(drafts[key], {
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
      precision: decimals === 0 ? "integer" : "decimal",
    });
    if (result.status === "invalid") {
      return [
        `${routeNumberLabels[key]} must be a non-negative ${decimals === 0 ? "whole number" : "number"} no greater than ${Number.MAX_SAFE_INTEGER}.`,
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

const numericFilters = [
  { key: "minDistanceKm", id: "route-min-distance", unit: "km", adjustmentStep: 0.1, decimals: 3 },
  { key: "maxDistanceKm", id: "route-max-distance", unit: "km", adjustmentStep: 0.1, decimals: 3 },
  { key: "minAscentM", id: "route-min-ascent", unit: "m", adjustmentStep: 10, decimals: 0 },
  { key: "maxAscentM", id: "route-max-ascent", unit: "m", adjustmentStep: 10, decimals: 0 },
] as const;
