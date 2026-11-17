import type { AppRouter, inferRouterOutputs } from "@repo/api/client";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader } from "@repo/ui/components/card";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatShortDayLabel, shiftDateKey } from "../../lib/planning";
import { TrainingLoadChart } from "./training-load-chart";

type PlanTabProjection = inferRouterOutputs<AppRouter>["trainingPlans"]["getPlanTabProjection"];
type LoadStatus = NonNullable<
  PlanTabProjection["timeline"]
>["days"][number]["load"]["scheduledLoadStatus"];
type PathItem = {
  date: string;
  id: string;
  kind: "completed" | "scheduled";
  load: number | null;
  loadStatus: LoadStatus;
  title: string;
};

function StatusAwareCommonLoadValue({
  status,
  testId,
  value,
}: {
  status: LoadStatus;
  testId?: string;
  value: number | null | undefined;
}) {
  if (status === "unavailable" || value === null || value === undefined) {
    return (
      <Badge
        className="h-auto max-w-full overflow-visible text-left whitespace-normal break-words"
        testId={testId}
        variant="outline"
      >
        Common Load unavailable
      </Badge>
    );
  }
  const label = `Common Load ${status === "partial" ? "~" : ""}${Math.round(value * 10) / 10}`;
  return (
    <Badge
      className="h-auto max-w-full overflow-visible text-left whitespace-normal break-words"
      testId={testId}
    >
      {label}
    </Badge>
  );
}

function sumPlanned(values: Array<number | null | undefined>) {
  if (values.length === 0 || values.some((value) => typeof value !== "number")) return null;
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

function aggregateLoadStatus(statuses: LoadStatus[]): LoadStatus {
  if (statuses.length === 0 || statuses.includes("unavailable")) return "unavailable";
  if (statuses.includes("partial")) return "partial";
  return statuses.every((status) => status === "known_zero") ? "known_zero" : "complete";
}

function aggregateCompletedLoad(values: Array<{ status: LoadStatus; value: number | null }>): {
  status: LoadStatus;
  value: number | null;
} {
  const known = values.filter(
    (entry): entry is { status: LoadStatus; value: number } => typeof entry.value === "number",
  );
  if (known.length === 0) return { status: "unavailable", value: null };
  const value = known.reduce((total, entry) => total + entry.value, 0);
  if (
    known.length !== values.length ||
    values.some((entry) => entry.status === "partial" || entry.status === "unavailable")
  ) {
    return { status: "partial", value };
  }
  return {
    status: values.every((entry) => entry.status === "known_zero") ? "known_zero" : "complete",
    value,
  };
}

function ItemList({ emptyMessage, items }: { emptyMessage: string; items: PathItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div
          className="flex items-center justify-between gap-3 rounded-xl border p-3"
          data-scheduled-item-id={item.kind === "scheduled" ? item.id : undefined}
          key={`${item.kind}:${item.id}`}
        >
          <div>
            <p className="font-medium">{item.title}</p>
            <p className="text-xs text-muted-foreground">
              {formatShortDayLabel(item.date)} ·{` `}
              {item.kind === "completed" ? "Completed activity" : "Scheduled activity"}
            </p>
          </div>
          <StatusAwareCommonLoadValue status={item.loadStatus} value={item.load} />
        </div>
      ))}
    </div>
  );
}

export function TrainingLoadPath({
  isError = false,
  isLoading = false,
  onRetry,
  projection,
  errorMessage = "Training path could not be refreshed. No client-side estimate is shown.",
  retryLabel = "Retry training path",
  selectedDate,
  onSelectedDateChange,
}: {
  errorMessage?: string;
  isError?: boolean;
  isLoading?: boolean;
  onRetry?: () => void;
  projection: PlanTabProjection | undefined;
  retryLabel?: string;
  selectedDate?: string;
  onSelectedDateChange?: (date: string) => void;
}) {
  const timeline = projection?.timeline;
  const completedItems =
    timeline?.days.flatMap((day) =>
      day.completedItems.map<PathItem>((item) => ({
        date: day.date,
        id: item.id,
        kind: "completed",
        load: item.completedLoad,
        loadStatus: item.completedLoadStatus,
        title: item.title,
      })),
    ) ?? [];
  const scheduledItems =
    timeline?.days.flatMap((day) =>
      day.scheduledItems
        .filter((item) => item.status !== "cancelled")
        .map<PathItem>((item) => ({
          date: day.date,
          id: item.id,
          kind: "scheduled",
          load: item.plannedLoad,
          loadStatus: item.plannedLoadStatus,
          title: item.title,
        })),
    ) ?? [];
  const items = [...completedItems, ...scheduledItems].sort((left, right) =>
    left.date.localeCompare(right.date),
  );
  const completedLoad = aggregateCompletedLoad(
    timeline?.days.map((day) => ({
      status: day.load.completedLoadStatus,
      value: day.load.completedLoad,
    })) ?? [],
  );
  const remainingLoad = sumPlanned(timeline?.days.map((day) => day.load.remainingLoad) ?? []);
  const remainingLoadStatus = aggregateLoadStatus(
    timeline?.days.map((day) => day.load.remainingLoadStatus) ?? [],
  );
  const rangeLabel = timeline
    ? `for ${timeline.startDate}–${timeline.endDate}${projection?.planningTimezone ? ` in ${projection.planningTimezone}` : ""}`
    : "for the requested planning window";

  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-3 border-b bg-muted/20 px-4 py-4 sm:gap-4 sm:px-6 sm:py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="leading-none font-semibold">Training path</h2>
            <CardDescription className="hidden sm:block">
              Load context {rangeLabel}.
            </CardDescription>
          </div>
          {timeline ? (
            <Badge className="font-normal" variant="outline">
              {timeline.days.length} days
            </Badge>
          ) : null}
        </div>
        {selectedDate && onSelectedDateChange ? (
          <div className="flex items-end justify-center gap-2 sm:flex-wrap sm:justify-start">
            <Button
              aria-label="Previous day"
              onClick={() => onSelectedDateChange(shiftDateKey(selectedDate, -1))}
              size="sm"
              type="button"
              variant="outline"
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
              <span className="hidden sm:inline">Previous day</span>
            </Button>
            <label className="grid min-w-0 gap-1 text-sm font-medium" htmlFor="plan-selected-date">
              <span className="text-xs text-muted-foreground">Selected day</span>
              <input
                className="h-9 w-[11.5rem] rounded-md border bg-background px-3 text-sm tabular-nums shadow-xs sm:w-auto"
                id="plan-selected-date"
                onChange={(event) => {
                  if (event.currentTarget.value) onSelectedDateChange(event.currentTarget.value);
                }}
                type="date"
                value={selectedDate}
              />
            </label>
            <Button
              aria-label="Next day"
              onClick={() => onSelectedDateChange(shiftDateKey(selectedDate, 1))}
              size="sm"
              type="button"
              variant="outline"
            >
              <span className="hidden sm:inline">Next day</span>
              <ChevronRight aria-hidden="true" className="size-4" />
            </Button>
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="px-4 py-3 sm:px-6 sm:pt-5">
        {isLoading ? (
          <div aria-live="polite" className="space-y-3">
            <p className="text-sm text-muted-foreground">Loading training path…</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="h-16 animate-pulse rounded-xl bg-muted" />
              <div className="h-16 animate-pulse rounded-xl bg-muted" />
            </div>
          </div>
        ) : isError ? (
          <div className="space-y-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            <p>{errorMessage}</p>
            {onRetry ? (
              <Button onClick={onRetry} size="sm" type="button" variant="outline">
                {retryLabel}
              </Button>
            ) : null}
          </div>
        ) : !timeline ? (
          <div className="space-y-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            <p>No training path data is ready yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div
                className="min-w-0 rounded-xl border bg-background p-2.5"
                data-testid="training-load-summary-completed"
              >
                <p className="text-xs leading-tight text-muted-foreground">Completed</p>
                <StatusAwareCommonLoadValue
                  status={completedLoad.status}
                  testId="training-load-summary-completed-value"
                  value={completedLoad.value}
                />
              </div>
              <div
                className="min-w-0 rounded-xl border bg-background p-2.5"
                data-testid="training-load-summary-scheduled"
              >
                <p className="text-xs leading-tight text-muted-foreground">Scheduled</p>
                <StatusAwareCommonLoadValue
                  status={remainingLoadStatus}
                  testId="training-load-summary-scheduled-value"
                  value={remainingLoad}
                />
              </div>
            </div>
            <details className="group rounded-xl border bg-muted/10">
              <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
                <span className="flex items-center justify-between gap-3">
                  Timeline &amp; diagnostics
                  <span className="text-xs font-normal text-muted-foreground group-open:hidden">
                    Show details
                  </span>
                  <span className="hidden text-xs font-normal text-muted-foreground group-open:inline">
                    Hide details
                  </span>
                </span>
              </summary>
              <div className="space-y-3 border-t p-4">
                <TrainingLoadChart fitness={projection.fitness} days={timeline.days} />
                <ItemList
                  emptyMessage="No activities are scheduled in this window."
                  items={items}
                />
              </div>
            </details>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
