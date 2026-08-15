import type { AppRouter, inferRouterOutputs } from "@repo/api/client";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader } from "@repo/ui/components/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { formatShortDayLabel } from "../../lib/planning";

type PlanTabProjection = inferRouterOutputs<AppRouter>["trainingPlans"]["getPlanTabProjection"];
type SourceCoverage = PlanTabProjection["sourceCoverage"];
type PathItem = {
  date: string;
  id: string;
  kind: "completed" | "scheduled";
  load: number | null;
  title: string;
};

function coverageIsComplete(coverage: { status: "complete" | "partial" } | null | undefined) {
  return coverage?.status === "complete";
}

function coverageLabel(coverage: SourceCoverage | undefined) {
  const activities = coverage?.activities?.status ?? "unavailable";
  const scheduled = coverage?.scheduledItems?.status ?? "unavailable";
  return `Completed activity coverage is ${activities}; scheduled work coverage is ${scheduled}.`;
}

function CommonLoadValue({ value }: { value: number | null | undefined }) {
  return value === null || value === undefined ? (
    <Badge variant="outline">Common Load unavailable</Badge>
  ) : (
    <Badge>Common Load {Math.round(value * 10) / 10}</Badge>
  );
}

function sumAvailable(values: Array<number | null | undefined>) {
  const available = values.filter((value): value is number => typeof value === "number");
  return available.length > 0 ? available.reduce((sum, value) => sum + value, 0) : null;
}

function ItemList({
  emptyMessage,
  items,
  sourceComplete,
  unavailableMessage,
}: {
  emptyMessage: string;
  items: PathItem[];
  sourceComplete: boolean;
  unavailableMessage: string;
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {sourceComplete ? emptyMessage : unavailableMessage}
      </p>
    );
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
          <CommonLoadValue value={item.load} />
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
  const sourceCoverage = projection?.sourceCoverage;
  const completedCoverageComplete = coverageIsComplete(sourceCoverage?.activities);
  const scheduledCoverageComplete = coverageIsComplete(sourceCoverage?.scheduledItems);
  const firmCoverageComplete = completedCoverageComplete && scheduledCoverageComplete;
  const completedItems =
    timeline?.days.flatMap((day) =>
      day.completedItems.map<PathItem>((item) => ({
        date: day.date,
        id: item.id,
        kind: "completed",
        load: item.completedLoad ?? null,
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
          load: item.plannedLoad ?? null,
          title: item.title,
        })),
    ) ?? [];
  const items = [...completedItems, ...scheduledItems].sort((left, right) =>
    left.date.localeCompare(right.date),
  );
  const completedLoad = sumAvailable(timeline?.days.map((day) => day.load.completedLoad) ?? []);
  const remainingLoad = sumAvailable(timeline?.days.map((day) => day.load.remainingLoad) ?? []);
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
            <p>Training path is unavailable from the current planning projection.</p>
            <p>{coverageLabel(sourceCoverage)}</p>
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
                  <CommonLoadValue value={completedLoad} />
                </div>
                <div className="rounded-xl border p-3">
                  <p className="text-xs text-muted-foreground">Remaining scheduled work</p>
                  <CommonLoadValue value={remainingLoad} />
                </div>
              </div>
              <ItemList
                emptyMessage="No activities are scheduled in this window."
                items={items}
                sourceComplete={firmCoverageComplete}
                unavailableMessage="Scheduled work is unavailable because completed or scheduled coverage is not complete."
              />
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
