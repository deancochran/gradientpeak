import type { AppRouter, inferRouterOutputs } from "@repo/api/client";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader } from "@repo/ui/components/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { formatShortDayLabel } from "../../lib/planning";
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
  value,
}: {
  status: LoadStatus;
  value: number | null | undefined;
}) {
  if (status === "unavailable" || value === null || value === undefined) {
    return <Badge variant="outline">Common Load unavailable</Badge>;
  }
  const label = `Common Load ${status === "partial" ? "~" : ""}${Math.round(value * 10) / 10}`;
  return <Badge>{label}</Badge>;
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
}: {
  isError?: boolean;
  isLoading?: boolean;
  onRetry?: () => void;
  projection: PlanTabProjection | undefined;
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
    <Card>
      <CardHeader>
        <h2 className="leading-none font-semibold">Training path</h2>
        <CardDescription>Server-composed Common Load {rangeLabel}.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p aria-live="polite" className="text-sm text-muted-foreground">
            Loading training path…
          </p>
        ) : isError ? (
          <div className="space-y-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            <p>Training path could not be refreshed. No client-side estimate is shown.</p>
            {onRetry ? (
              <Button onClick={onRetry} size="sm" type="button" variant="outline">
                Retry training path
              </Button>
            ) : null}
          </div>
        ) : !timeline ? (
          <div className="space-y-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            <p>No training path data is ready yet.</p>
          </div>
        ) : (
          <Tabs defaultValue="firm">
            <TabsList>
              <TabsTrigger value="firm">Firm</TabsTrigger>
            </TabsList>
            <TabsContent className="space-y-3" value="firm">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border p-3">
                  <p className="text-xs text-muted-foreground">Completed</p>
                  <StatusAwareCommonLoadValue
                    status={completedLoad.status}
                    value={completedLoad.value}
                  />
                </div>
                <div className="rounded-xl border p-3">
                  <p className="text-xs text-muted-foreground">Remaining scheduled work</p>
                  <StatusAwareCommonLoadValue status={remainingLoadStatus} value={remainingLoad} />
                </div>
              </div>
              <TrainingLoadChart fitness={projection.fitness} days={timeline.days} />
              <ItemList emptyMessage="No activities are scheduled in this window." items={items} />
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
