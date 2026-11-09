import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import {
  buildActivityStreamSeries,
  buildChartPolyline,
  normalizeWebActivityLaps,
  summarizeSwimDetails,
  type WebActivityStreamRecord,
} from "../../lib/activity-stream-presentation";

function formatNumber(value: number | null, suffix = "") {
  if (value === null) return "—";
  const formatted = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${formatted}${suffix}`;
}

function formatLapDuration(seconds: number | null) {
  if (seconds === null) return "—";
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  const remainingSeconds = rounded % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

export function ActivityStreamChartsCard({
  records,
  scopeDescription,
}: {
  records?: readonly WebActivityStreamRecord[] | null;
  scopeDescription?: string;
}) {
  const series = buildActivityStreamSeries(records);

  return (
    <Card>
      <CardHeader>
        <CardTitle aria-level={2} role="heading">
          Stream charts
        </CardTitle>
        <CardDescription>
          {scopeDescription ??
            "Time-series previews decoded from the accepted source activity file."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {series.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No chartable stream samples are available for this activity.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {series.map((item) => {
              const points = buildChartPolyline(item.values);
              const latest = item.values.at(-1)?.y ?? null;
              return (
                <section className="space-y-3 rounded-xl border border-border p-4" key={item.key}>
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-medium text-foreground">{item.label}</h3>
                    <p className="text-xs text-muted-foreground">
                      Latest {formatNumber(latest, ` ${item.unit}`)}
                    </p>
                  </div>
                  <div
                    aria-label={`${item.label} over time`}
                    className="h-36 rounded-lg bg-muted/20 p-3"
                    role="img"
                  >
                    <svg
                      aria-hidden="true"
                      className="h-full w-full overflow-visible"
                      preserveAspectRatio="none"
                      viewBox="0 0 100 100"
                    >
                      <polyline
                        className="text-primary"
                        fill="none"
                        points={points}
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2.5"
                        vectorEffect="non-scaling-stroke"
                      />
                    </svg>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ActivitySwimDetailCards({
  activityCategory,
  laps,
  lengths,
  poolLengthMeters,
  scopeDescription,
  summary,
}: {
  activityCategory?: string | null;
  laps?: readonly unknown[] | null;
  lengths?: readonly unknown[] | null;
  poolLengthMeters?: number | null;
  scopeDescription?: string;
  summary?: Record<string, unknown> | null;
}) {
  if (activityCategory !== "swim") return null;

  const swim = summarizeSwimDetails({
    ...(summary === undefined ? {} : { summary }),
    ...(lengths === undefined ? {} : { lengths }),
  });
  const resolvedPoolLengthMeters = swim.poolLengthMeters ?? poolLengthMeters ?? null;
  const normalizedLaps = normalizeWebActivityLaps(laps);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle aria-level={2} role="heading">
            Pool swim detail
          </CardTitle>
          <CardDescription>
            {scopeDescription ?? "Pool and length metadata preserved from the source file."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">Pool length</dt>
              <dd className="font-medium text-foreground">
                {resolvedPoolLengthMeters === null
                  ? "—"
                  : formatNumber(resolvedPoolLengthMeters, " meters")}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Lengths</dt>
              <dd className="font-medium text-foreground">{swim.lengths}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Active lengths</dt>
              <dd className="font-medium text-foreground">{swim.activeLengths}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Total strokes</dt>
              <dd className="font-medium text-foreground">{formatNumber(swim.totalStrokes)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle aria-level={2} role="heading">
            Laps
          </CardTitle>
          <CardDescription>
            {scopeDescription ?? "Lap summaries decoded from the accepted activity file."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {normalizedLaps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No lap data is available.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="pb-2 font-medium" scope="col">
                      Lap
                    </th>
                    <th className="pb-2 font-medium" scope="col">
                      Time
                    </th>
                    <th className="pb-2 font-medium" scope="col">
                      Distance
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {normalizedLaps.map((lap) => (
                    <tr
                      className="border-t border-border"
                      key={`${lap.index}-${lap.elapsedSeconds}`}
                    >
                      <th className="py-2 font-medium text-foreground" scope="row">
                        {lap.index + 1}
                      </th>
                      <td className="py-2 text-muted-foreground">
                        {formatLapDuration(lap.elapsedSeconds)}
                      </td>
                      <td className="py-2 text-muted-foreground">
                        {formatNumber(lap.distanceMeters, " m")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
