import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import {
  formatCompactDuration,
  formatDistance,
  formatHeartRate,
  formatPower,
} from "../../lib/activity-route-helpers";
import {
  buildActivityStreamSeries,
  buildChartPolyline,
  normalizeWebActivityLaps,
  summarizeSwimDetails,
  type WebActivityStreamRecord,
} from "../../lib/activity-stream-presentation";
import type { PreferredUnitSystem } from "../../lib/units/presentation";

type Props = {
  records?: WebActivityStreamRecord[];
  laps?: unknown[];
  lengths?: unknown[];
  summary?: Record<string, unknown>;
  isSwim: boolean;
  unitSystem: PreferredUnitSystem;
};

export function ActivityStreamDetails({
  records,
  laps,
  lengths,
  summary,
  isSwim,
  unitSystem,
}: Props) {
  const series = buildActivityStreamSeries(records);
  const lapRows = normalizeWebActivityLaps(laps);
  const swim = summarizeSwimDetails({
    ...(summary ? { summary } : {}),
    ...(lengths ? { lengths } : {}),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Stream charts</CardTitle>
        </CardHeader>
        <CardContent>
          {series.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No chartable stream samples are available.
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {series.map((item) => (
                <figure className="rounded-xl border border-border p-4" key={item.key}>
                  <figcaption className="mb-3 text-sm font-medium">
                    {item.label} ({item.unit})
                  </figcaption>
                  <svg
                    aria-label={`${item.label} over time`}
                    className="h-36 w-full"
                    preserveAspectRatio="none"
                    role="img"
                    viewBox="0 0 100 100"
                  >
                    <polyline
                      fill="none"
                      points={buildChartPolyline(item.values)}
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {item.values.length} accepted samples
                  </p>
                </figure>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Laps</CardTitle>
        </CardHeader>
        <CardContent>
          {lapRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No laps were recorded.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-2">Lap</th>
                    <th>Time</th>
                    <th>Distance</th>
                    <th>Avg HR</th>
                    <th>Avg power</th>
                  </tr>
                </thead>
                <tbody>
                  {lapRows.map((lap) => (
                    <tr
                      className="border-b border-border/60"
                      key={`${lap.index}-${lap.elapsedSeconds}`}
                    >
                      <td className="py-2">{lap.index + 1}</td>
                      <td>{formatCompactDuration(lap.elapsedSeconds)}</td>
                      <td>{formatDistance(lap.distanceMeters, unitSystem)}</td>
                      <td>{formatHeartRate(lap.averageHeartRate)}</td>
                      <td>{formatPower(lap.averagePower)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {isSwim ? (
        <Card>
          <CardHeader>
            <CardTitle>Pool swim detail</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Metric
              label="Pool length"
              value={swim.poolLength == null ? "-" : `${swim.poolLength} ${swim.poolLengthUnit}`}
            />
            <Metric label="Lengths" value={`${swim.lengths}`} />
            <Metric label="Active lengths" value={`${swim.activeLengths}`} />
            <Metric
              label="Total strokes"
              value={swim.totalStrokes == null ? "-" : `${Math.round(swim.totalStrokes)}`}
            />
            <Metric
              label="Avg stroke distance"
              value={
                swim.averageStrokeDistance == null
                  ? "-"
                  : `${swim.averageStrokeDistance.toFixed(2)} m`
              }
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}
