import { Badge } from "@repo/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";

type OverviewModel = {
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
    </div>
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
