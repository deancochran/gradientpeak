import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";

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
  const update = <TKey extends keyof RouteLibraryFilters>(
    key: TKey,
    value: RouteLibraryFilters[TKey],
  ) => onChange({ ...filters, [key]: value });

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
          value={filters.minDistanceKm}
          onChange={(value) => update("minDistanceKm", value)}
        />
        <NumberFilter
          id="route-max-distance"
          label="Maximum distance (km)"
          value={filters.maxDistanceKm}
          onChange={(value) => update("maxDistanceKm", value)}
        />
        <NumberFilter
          id="route-min-ascent"
          label="Minimum ascent (m)"
          value={filters.minAscentM}
          onChange={(value) => update("minAscentM", value)}
        />
        <NumberFilter
          id="route-max-ascent"
          label="Maximum ascent (m)"
          value={filters.maxAscentM}
          onChange={(value) => update("maxAscentM", value)}
        />
      </div>
      <div className="flex justify-end">
        <Button onClick={onClear} type="button" variant="ghost">
          Clear filters
        </Button>
      </div>
    </fieldset>
  );
}

function NumberFilter({
  id,
  label,
  onChange,
  value,
}: {
  id: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="space-y-2 text-sm font-medium" htmlFor={id}>
      <span>{label}</span>
      <Input
        aria-label={label}
        id={id}
        min="0"
        onChange={(event) => onChange(event.target.value)}
        step="any"
        type="number"
        value={value}
      />
    </label>
  );
}
