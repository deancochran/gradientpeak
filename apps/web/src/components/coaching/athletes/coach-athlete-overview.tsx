import { Badge } from "@repo/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
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
    freshness: string;
    importStatus: string;
    coverage: { lastActivityAt: string | null };
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
        <h1 className="text-3xl font-semibold text-white">Athlete workspace unavailable</h1>
        <p className="mt-2 max-w-xl text-sm text-slate-400">
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
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-cyan-300">
          Read-only overview
        </p>
        <h1 className="text-3xl font-semibold text-white">Current training state</h1>
        <p className="text-sm text-slate-400">
          Metrics are presented only when the athlete has shared this scope through the selected
          organization.
        </p>
      </header>
      {metricsAvailable ? (
        <Card className="border-slate-800 bg-slate-900 text-slate-50">
          <CardHeader>
            <CardTitle>Published load state</CardTitle>
            <CardDescription className="text-slate-400">
              {model.publishedState
                ? `Published ${new Date(model.publishedState.publishedAt).toLocaleString()}`
                : "No published load state is available."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {baseline ? (
              <dl className="grid gap-4 sm:grid-cols-3">
                <Metric label="Long-term load" value={baseline.longTermLoad} />
                <Metric label="Recent load" value={baseline.recentLoad} />
                <Metric label="Load balance" value={baseline.loadBalance} />
              </dl>
            ) : (
              <p className="text-sm text-slate-400">
                No published load state is available to this coaching view.
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}
      <TrainingLoadHistory history={model.loadHistory} />
      {metricsAvailable ? (
        <>
          <Card className="border-slate-800 bg-slate-900 text-slate-50">
            <CardHeader>
              <CardTitle>Published performance estimates</CardTitle>
              <CardDescription className="text-slate-400">
                Actual published estimates only; curves and unshared evidence are not shown here.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {model.publishedState?.estimates.length ? (
                <ul className="space-y-3">
                  {model.publishedState.estimates.map((estimate) => (
                    <li
                      key={`${estimate.activityCategory}:${estimate.capabilityKind}:${estimate.effectiveAt}`}
                      className="rounded border border-slate-800 p-3"
                    >
                      <p className="font-medium">
                        {estimate.capabilityKind} · {estimate.activityCategory}
                      </p>
                      <p className="text-lg">
                        {estimate.value} {estimate.unit}
                      </p>
                      <p className="text-sm text-slate-400">
                        Confidence {(estimate.confidence * 100).toFixed(0)}% · effective{" "}
                        {new Date(estimate.effectiveAt).toLocaleDateString()} ·{" "}
                        {estimate.algorithmVersion}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-400">
                  No published performance estimates are available to this coaching view.
                </p>
              )}
            </CardContent>
          </Card>
          <Card className="border-slate-800 bg-slate-900 text-slate-50">
            <CardHeader>
              <CardTitle>Projection status</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Badge className="border-cyan-800 bg-cyan-950 text-cyan-200">
                Freshness: {model.status?.freshness ?? "unknown"}
              </Badge>
              <Badge className="border-slate-700 bg-slate-800 text-slate-200">
                Import: {model.status?.importStatus ?? "unknown"}
              </Badge>
              {model.status?.coverage.lastActivityAt ? (
                <span className="w-full text-sm text-slate-400">
                  Last activity in projection:{" "}
                  {new Date(model.status.coverage.lastActivityAt).toLocaleString()}
                </span>
              ) : (
                <span className="w-full text-sm text-slate-400">
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
      <Card className="border-slate-800 bg-slate-900 text-slate-50">
        <CardHeader>
          <CardTitle>Recent training load</CardTitle>
          <CardDescription className="text-slate-400">
            Historical load is not available in the published projection.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  if (history.result.status === "unavailable") {
    return (
      <Card className="border-slate-800 bg-slate-900 text-slate-50">
        <CardHeader>
          <CardTitle>Recent training load</CardTitle>
          <CardDescription className="text-slate-400">
            Historical load is unavailable ({history.result.reason.replaceAll("_", " ")}). No values
            are inferred.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const points = history.result.points.slice(-28);
  const timezone = history.result.identity.planningTimezone;
  return (
    <section className="space-y-3" aria-label="Recent training load">
      <SimpleTrendChart
        axisLabels={{ x: "Planning date", y: "Common Load points" }}
        description={`Completed daily Common Load points for the latest ${points.length} complete planning days (${timezone}). This is derived load, not a performance estimate.`}
        emptyMessage="No complete daily load observations are available."
        formatX={(value) =>
          new Date(value).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          })
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
      <p className="text-xs text-slate-400">
        Common Load points are derived from completed activity; long-term load, recent load, and
        load balance below are modeled load state. Dates are planning dates in {timezone}. Complete
        days only; no future values are shown.
      </p>
      {history.result.maturity.status === "establishing_baseline" ? (
        <p className="text-xs text-amber-200">
          Modeled baseline is still being established; treat long-term load with care.
        </p>
      ) : null}
      <div className="overflow-x-auto rounded border border-slate-800">
        <table className="w-full min-w-[38rem] text-left text-sm">
          <caption className="sr-only">
            Completed Common Load points and modeled load state for the latest complete planning
            days
          </caption>
          <thead className="bg-slate-950 text-slate-300">
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
              <tr className="border-t border-slate-800" key={point.date}>
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
function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-sm text-slate-400">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold">{value.toFixed(1)}</dd>
    </div>
  );
}
