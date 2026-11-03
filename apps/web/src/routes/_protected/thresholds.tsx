import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { createFileRoute, Link } from "@tanstack/react-router";
import { api } from "../../lib/api/client";
import { formatRunningPace } from "../../lib/units/presentation";

export const Route = createFileRoute("/_protected/thresholds")({
  component: ThresholdsPage,
});

function formatThreshold(value: number, unit: "watts" | "meters_per_second" | "bpm") {
  if (unit === "watts") return `${Math.round(value)} W`;
  if (unit === "bpm") return `${Math.round(value)} bpm`;
  return formatRunningPace(1_000 / value, "metric");
}

function ThresholdsPage() {
  const overviewQuery = api.athleteIntelligence.getThresholdOverview.useQuery({});
  const overview = overviewQuery.data;

  return (
    <div className="space-y-6" data-testid="threshold-overview">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Thresholds</h1>
        <p className="mt-2 text-muted-foreground">Calculated from eligible completed activities.</p>
      </div>

      {overviewQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading thresholds...</p>
      ) : overviewQuery.isError ? (
        <Card role="alert">
          <CardHeader>
            <CardTitle>Thresholds unavailable</CardTitle>
            <CardDescription>Try again to load calculated thresholds.</CardDescription>
          </CardHeader>
        </Card>
      ) : overview ? (
        <>
          <section className="grid gap-4 md:grid-cols-3" aria-label="Current calculated thresholds">
            {(["bike", "run", "swim"] as const).map((activityCategory) => {
              const threshold = overview.current.thresholds[activityCategory];
              return (
                <Card key={activityCategory}>
                  <CardHeader>
                    <CardTitle className="capitalize">{activityCategory}</CardTitle>
                    <CardDescription>
                      {threshold.status === "available"
                        ? `Effective ${new Date(threshold.effectiveAt).toLocaleDateString()}`
                        : "No calculated threshold"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-semibold">
                      {threshold.status === "available"
                        ? formatThreshold(threshold.value, threshold.unit)
                        : "—"}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </section>

          <section aria-labelledby="threshold-history-heading">
            <h2 className="text-xl font-semibold" id="threshold-history-heading">
              History
            </h2>
            {overview.history.items.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                No calculated threshold changes yet.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {overview.history.items.map((item) => (
                  <Card key={item.thresholdId}>
                    <CardContent className="flex items-center justify-between gap-4 p-4">
                      <div>
                        <p className="font-medium capitalize">{item.activityCategory}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatThreshold(item.value, item.unit)} ·{" "}
                          {new Date(item.effectiveAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        {item.sourceActivities.map((activity) => (
                          <Link
                            className="text-sm font-medium underline"
                            key={activity.id}
                            params={{ activityId: activity.id }}
                            to="/activities/$activityId"
                          >
                            {activity.name}
                          </Link>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Build your threshold history</CardTitle>
            <CardDescription>
              Record eligible completed activities to calculate thresholds and pace zones here.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
