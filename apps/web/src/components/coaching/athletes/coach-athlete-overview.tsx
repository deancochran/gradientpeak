import { Badge } from "@repo/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import {
  formatTrainingStateDate,
  getTrainingStateMetric,
  TrainingStateChart,
  TrainingStateLegend,
  type TrainingStateMetricId,
  type TrainingStateVisualContract,
  type TrainingStateVisualPoint,
} from "@repo/ui/components/training-state-chart";
import { SimpleTrendChart } from "../../charts/simple-trend-chart";

type LoadHistoryPoint = {
  date: string;
  dailyLoad: number;
  longTermLoad: number;
  recentLoad: number;
  loadBalance: number;
};

type OverviewModel = {
  metricsAvailable?: boolean;
  publishedState?: {
    publishedAt: string;
    baseline: { longTermLoad: number; recentLoad: number; loadBalance: number };
    estimates: Array<{
      activityCategory: string;
      capabilityKind: string;
      value: number;
      unit: string;
      confidence: number;
      effectiveAt: string;
      computedAt: string;
      algorithmVersion: string;
    }>;
  } | null;
  status?: {
    asOf: string;
    freshness: string;
    importStatus: string;
    coverage: { startAt: string | null; endAt: string | null; lastActivityAt: string | null };
  };
  loadHistory?: {
    publishedRevision: number;
    algorithmVersion: string;
    result:
      | {
          status: "available";
          identity: { planningTimezone: string; startDate: string; endDate: string };
          maturity: { status: "establishing_baseline" | "mature" };
          points: LoadHistoryPoint[];
        }
      | { status: "unavailable"; reason: string };
  } | null;
};

export function CoachAthleteOverview({
  athleteId,
  result,
}: {
  athleteId: string;
  result: { status: "granted"; model: OverviewModel } | { status: "unavailable" };
}) {
  if (result.status === "unavailable")
    return (
      <section>
        <h2 className="text-xl font-semibold text-foreground">Athlete workspace unavailable</h2>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          This athlete is unavailable in this organization, or their metrics are not shared with
          you.
        </p>
      </section>
    );
  const { model } = result;
  const metricsAvailable =
    model.metricsAvailable ?? (model.publishedState != null || model.status !== undefined);
  const baseline = model.publishedState?.baseline;
  return (
    <div className="space-y-6" key={athleteId}>
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">
          Shared training context
        </p>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Current training state
        </h2>
        <p className="text-sm text-muted-foreground">
          Metrics are presented only when the athlete has shared this scope through the selected
          organization.
        </p>
      </header>
      {metricsAvailable ? (
        <Card data-testid="published-training-state">
          <CardHeader>
            <CardTitle>Published training state</CardTitle>
            <CardDescription>
              {model.publishedState
                ? `Published ${new Date(model.publishedState.publishedAt).toLocaleString()}. This is a modeled state, not readiness advice.`
                : "No published load state is available."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {baseline ? (
              <>
                <PublishedStateFreshness status={model.status} />
                <dl className="grid gap-4 sm:grid-cols-3">
                  <Metric label="Fitness" detail="Long-term load" value={baseline.longTermLoad} />
                  <Metric label="Fatigue" detail="Recent load" value={baseline.recentLoad} />
                  <Metric label="Form" detail="Load balance" value={baseline.loadBalance} />
                </dl>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No published load state is available to this coaching view.
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}
      <TrainingLoadHistory history={model.loadHistory} />
      {metricsAvailable ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Published performance estimates</CardTitle>
              <CardDescription>
                Actual published estimates only; curves and unshared evidence are not shown here.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {model.publishedState?.estimates.length ? (
                <ul className="space-y-3">
                  {model.publishedState.estimates.map((estimate) => (
                    <li
                      key={`${estimate.activityCategory}:${estimate.capabilityKind}:${estimate.effectiveAt}`}
                      className="rounded border border-border p-3"
                    >
                      <p className="font-medium">
                        {estimate.capabilityKind} · {estimate.activityCategory}
                      </p>
                      <p className="text-lg">
                        {estimate.value} {estimate.unit}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Confidence {(estimate.confidence * 100).toFixed(0)}% · effective{" "}
                        {new Date(estimate.effectiveAt).toLocaleDateString()} ·{" "}
                        {estimate.algorithmVersion}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No published performance estimates are available to this coaching view.
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Projection status</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Badge className="border-border bg-muted text-foreground">
                Freshness: {model.status?.freshness ?? "unknown"}
              </Badge>
              <Badge className="border-border bg-muted text-foreground">
                Import: {model.status?.importStatus ?? "unknown"}
              </Badge>
              {model.status?.asOf ? (
                <span className="w-full text-sm text-muted-foreground">
                  Read model as of: {new Date(model.status.asOf).toLocaleString()}
                </span>
              ) : null}
              {model.status?.coverage.startAt || model.status?.coverage.endAt ? (
                <span className="w-full text-sm text-muted-foreground">
                  Coverage: {formatCoverage(model.status.coverage.startAt)} to{" "}
                  {formatCoverage(model.status.coverage.endAt)}
                </span>
              ) : null}
              {model.status?.coverage.lastActivityAt ? (
                <span className="w-full text-sm text-muted-foreground">
                  Last activity in projection:{" "}
                  {new Date(model.status.coverage.lastActivityAt).toLocaleString()}
                </span>
              ) : (
                <span className="w-full text-sm text-muted-foreground">
                  No activity date is available in this projection.
                </span>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function TrainingLoadHistory({ history }: { history: OverviewModel["loadHistory"] }) {
  if (!history) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent training load</CardTitle>
          <CardDescription>
            Historical load is not available in the published projection.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  if (history.result.status === "unavailable") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent training load</CardTitle>
          <CardDescription>
            Historical load is unavailable ({history.result.reason.replaceAll("_", " ")}). No values
            are inferred.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const points = history.result.points.slice(-28);
  const timezone = history.result.identity.planningTimezone;
  const trainingStatePoints: TrainingStateVisualPoint[] = points.map((point, index) => ({
    date: point.date,
    index,
    projected: { fatigue: null, fitness: null, form: null },
    recorded: {
      fatigue: point.recentLoad,
      fitness: point.longTermLoad,
      form: point.loadBalance,
    },
  }));
  const trainingStateVisual: TrainingStateVisualContract = {
    points: trainingStatePoints,
    sourceStatus: "recorded",
    timeZone: timezone,
    unitLabel: "Common Load points",
  };
  return (
    <section aria-label="Recent training load" className="space-y-3">
      <SimpleTrendChart
        axisLabels={{ x: "Planning date", y: "Common Load points" }}
        description={`Completed daily Common Load points for the latest ${points.length} complete planning days (${timezone}). This is derived load, not a performance estimate.`}
        emptyMessage="No complete daily load observations are available."
        formatX={(value) =>
          formatTrainingStateDate(new Date(value).toISOString().slice(0, 10), timezone)
        }
        formatValue={(value) => value.toFixed(1)}
        points={points.map((point) => ({
          id: point.date,
          label: point.date,
          value: point.dailyLoad,
          x: Date.parse(`${point.date}T00:00:00Z`),
        }))}
        summaryLabels={{
          first: "First Common Load",
          latest: "Latest Common Load",
          trend: "Change",
        }}
        title="Recent completed daily Common Load"
      />
      <p className="text-xs text-muted-foreground">
        Common Load points are derived from completed activity. Dates are planning dates in{" "}
        {timezone}
        through {history.result.identity.endDate}. Complete days only; no future values are shown.
      </p>
      {history.result.maturity.status === "establishing_baseline" ? (
        <p className="text-xs text-warning">
          Modeled baseline is still being established; treat long-term load with care.
        </p>
      ) : null}
      <div>
        <h2 className="text-lg font-semibold text-foreground">Historical modeled load state</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          This series is shown only when completed activity history is shared. It does not predict
          future load or availability.
        </p>
      </div>
      <TrainingStateLegend sources={["recorded"]} />
      <div className="grid gap-3 lg:grid-cols-3">
        <HistoricalLoadChart
          metric="fitness"
          visual={trainingStateVisual}
          description="Historical modeled long-term load from the same completed daily Common Load observations."
        />
        <HistoricalLoadChart
          metric="fatigue"
          visual={trainingStateVisual}
          description="Historical modeled recent load from the same completed daily Common Load observations."
        />
        <HistoricalLoadChart
          metric="form"
          visual={trainingStateVisual}
          description="Historical modeled load balance from the same completed daily Common Load observations; negative values are shown as recorded."
        />
      </div>
      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full min-w-[38rem] text-left text-sm">
          <caption className="sr-only">
            Completed Common Load points and modeled load state for the latest complete planning
            days
          </caption>
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="p-2">Planning date</th>
              <th className="p-2">Completed Common Load points</th>
              <th className="p-2">Modeled recent load</th>
              <th className="p-2">Modeled long-term load</th>
              <th className="p-2">Modeled load balance</th>
            </tr>
          </thead>
          <tbody>
            {[...points].reverse().map((point) => (
              <tr className="border-t border-border" key={point.date}>
                <td className="p-2">{point.date}</td>
                <td className="p-2">{point.dailyLoad.toFixed(1)}</td>
                <td className="p-2">{point.recentLoad.toFixed(1)}</td>
                <td className="p-2">{point.longTermLoad.toFixed(1)}</td>
                <td className="p-2">{point.loadBalance.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function HistoricalLoadChart({
  description,
  metric,
  visual,
}: {
  description: string;
  metric: TrainingStateMetricId;
  visual: TrainingStateVisualContract;
}) {
  const definition = getTrainingStateMetric(metric);
  return (
    <TrainingStateChart
      description={description}
      emptyMessage={`No historical ${definition.label.toLowerCase()} values are available.`}
      series={[{ metric, source: "recorded" }]}
      title={`Historical ${definition.label} (recorded)`}
      visual={visual}
    />
  );
}

function formatCoverage(value: string | null) {
  return value ? new Date(value).toLocaleString() : "not available";
}

function PublishedStateFreshness({ status }: { status: OverviewModel["status"] }) {
  const freshness = status?.freshness ?? "unknown";
  const importStatus = status?.importStatus ?? "unknown";
  const warning =
    freshness === "stale"
      ? importStatus === "partial"
        ? "This published state is stale and the import is partial; it may not reflect recent data."
        : "This published state is stale and may not reflect recent data."
      : freshness === "unknown"
        ? "Freshness is unknown; the publication timestamp does not confirm that this state reflects recent data."
        : importStatus === "partial"
          ? "The import is partial; this published state may not reflect recent data."
          : importStatus === "unknown"
            ? "Import status is unknown; this published state may not reflect recent data."
            : null;
  return (
    <div className="flex flex-wrap items-center gap-2" role="status">
      <Badge className="border-border bg-muted text-foreground">Freshness: {freshness}</Badge>
      <Badge className="border-border bg-muted text-foreground">Import: {importStatus}</Badge>
      {warning ? <span className="w-full text-sm text-warning">{warning}</span> : null}
    </div>
  );
}

function Metric({ detail, label, value }: { detail: string; label: string; value: number }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">
        {label} <span className="text-xs">({detail})</span>
      </dt>
      <dd className="mt-1 text-2xl font-semibold">{value.toFixed(1)}</dd>
    </div>
  );
}
