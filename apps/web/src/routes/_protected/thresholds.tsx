import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import {
  formatThresholdDate,
  formatThresholdValue,
  groupThresholdHistory,
  ThresholdHistoryChart,
  thresholdMetricLabel,
} from "@repo/ui/components/threshold-history";
import { createFileRoute, Link } from "@tanstack/react-router";
import { api } from "../../lib/api/client";
import { loadRouteQuery } from "../../lib/api/route-loading";

export const Route = createFileRoute("/_protected/thresholds")({
  loader: ({ context }) =>
    loadRouteQuery(
      () =>
        context.apiUtils.athleteIntelligence.getThresholdOverview.getData({ historyLimit: 100 }),
      () => context.apiUtils.athleteIntelligence.getThresholdOverview.fetch({ historyLimit: 100 }),
    ),
  component: ThresholdsPage,
});

function ThresholdsPage() {
  const overviewQuery = api.athleteIntelligence.getThresholdOverview.useQuery({
    historyLimit: 100,
  });
  const overview = overviewQuery.data;

  return (
    <div className="space-y-6" data-testid="threshold-overview">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Thresholds</h1>
        <p className="mt-2 text-muted-foreground">Calculated from eligible completed activities.</p>
      </div>

      {overviewQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading thresholds...</p>
      ) : overviewQuery.isError && !overview ? (
        <Card role="alert">
          <CardHeader>
            <CardTitle>Thresholds unavailable</CardTitle>
            <CardDescription>Try again to load calculated thresholds.</CardDescription>
            <button
              className="w-fit text-sm font-medium underline"
              onClick={() => void overviewQuery.refetch()}
              type="button"
            >
              Try again
            </button>
          </CardHeader>
        </Card>
      ) : overview ? (
        <>
          {overviewQuery.isError ? (
            <Card role="status">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <p className="text-sm text-muted-foreground">
                  Showing cached threshold data. The latest refresh failed.
                </p>
                <button
                  className="text-sm font-medium underline"
                  onClick={() => void overviewQuery.refetch()}
                  type="button"
                >
                  Try again
                </button>
              </CardContent>
            </Card>
          ) : null}
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
                        ? formatThresholdValue(threshold.value, threshold.unit, activityCategory)
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
              <div className="mt-3 space-y-6">
                {groupThresholdHistory(overview.history.items).map((series) => (
                  <Card key={series.id}>
                    <CardHeader>
                      <CardTitle className="capitalize">
                        {thresholdMetricLabel(series.activityCategory, series.metric)}
                      </CardTitle>
                      <CardDescription>
                        Chronological calculated values on one {series.unit} scale.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <ThresholdHistoryChart
                        emptyMessage="No values available for this threshold."
                        series={series}
                        testId={`threshold-history-${series.id}`}
                      />
                      <ol
                        className="space-y-3"
                        aria-label={`${thresholdMetricLabel(series.activityCategory, series.metric)} evidence`}
                      >
                        {series.points.map((item) => (
                          <li
                            className="flex flex-wrap items-start justify-between gap-3 border-t pt-3"
                            key={item.thresholdId}
                          >
                            <div>
                              <p className="font-medium">
                                {formatThresholdValue(item.value, item.unit, item.activityCategory)}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Effective {formatThresholdDate(item.effectiveAt)} · {item.method} ·
                                policy {item.policyVersion}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
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
                          </li>
                        ))}
                      </ol>
                    </CardContent>
                  </Card>
                ))}
                {overview.history.nextCursor ? (
                  <p className="text-sm text-muted-foreground" role="status">
                    More calculated threshold history is available. This view shows the newest 100
                    records; additional records are not included in these charts.
                  </p>
                ) : null}
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
