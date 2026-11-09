import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import type {
  CoachAthleteBikeZones,
  CoachAthleteBikeZonesRead,
} from "../../../lib/coaching/athlete-zones-server-functions";

type Props = {
  identity: { organizationId: string; athleteProfileId: string };
  result: CoachAthleteBikeZonesRead | null;
  error?: boolean;
  onRetry?: () => void;
  retryPending?: boolean;
};

function label(value: string) {
  return value.replaceAll("_", " ");
}

function date(value: string | null) {
  return value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(value),
      )
    : "not published";
}

function ZoneGroup({
  title,
  unit,
  value,
}: {
  title: string;
  unit: string;
  value: CoachAthleteBikeZones["power"] | CoachAthleteBikeZones["heartRate"];
}) {
  const source = value.source;
  return (
    <section
      className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950"
      aria-label={title}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium text-slate-950 dark:text-slate-50">{title}</h3>
        <Badge variant={value.zoneAvailability === "available" ? "secondary" : "outline"}>
          {value.zoneAvailability}
        </Badge>
      </div>
      {source.availability === "available" ? (
        <p className="mt-2 text-sm">
          Threshold:{" "}
          <strong>
            {source.value} {unit}
          </strong>
        </p>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          Threshold unavailable. No ranges are shown.
        </p>
      )}
      {source.availability === "available" ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {label(source.state)} · {label(source.freshness)} · {label(source.provenance)} · effective{" "}
          {date(source.effectiveAt)}
        </p>
      ) : null}
      {value.zones ? (
        <>
          <p className="mt-3 text-xs text-muted-foreground">
            Rounded policy reference boundaries; not exact classification thresholds.
          </p>
          <ol className="mt-1 grid gap-1 text-sm sm:grid-cols-2">
            {Object.entries(value.zones).map(([zone, range]) => (
              <li key={zone}>
                <span className="font-medium">{zone}</span>: {range.min} to {range.max ?? "∞"}{" "}
                {unit}
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </section>
  );
}

/** Presentation-only. Route composition owns request timing and prevents zone denial from hiding other panels. */
export function CoachAthleteZonesCard({
  identity,
  result,
  error = false,
  onRetry,
  retryPending = false,
}: Props) {
  if (error || retryPending)
    return (
      <Card data-testid="coach-athlete-zones">
        <CardHeader>
          <CardTitle>
            <h2>Bike zones</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <div role="alert" className="space-y-3">
              <p>Bike zones could not be loaded.</p>
              {onRetry ? (
                <Button type="button" variant="outline" onClick={onRetry} disabled={retryPending}>
                  Retry bike zones
                </Button>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Loading bike zones…</p>
          )}
        </CardContent>
      </Card>
    );
  if (!result) return null;
  if (result.status === "forbidden")
    return (
      <Card data-testid="coach-athlete-zones">
        <CardHeader>
          <CardTitle>
            <h2>Bike zones</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Bike metrics are not available for this athlete.
          </p>
        </CardContent>
      </Card>
    );
  const { zones } = result;
  return (
    <Card
      data-testid="coach-athlete-zones"
      data-organization={identity.organizationId}
      data-athlete={identity.athleteProfileId}
    >
      <CardHeader>
        <CardTitle>
          <h2>Bike zones</h2>
        </CardTitle>
        <CardDescription>
          Canonical cycling thresholds; this is not a readiness or approval assessment.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant={zones.publication.status === "available" ? "secondary" : "outline"}>
            publication {zones.publication.status}
          </Badge>
          <Badge variant="outline">
            published {zones.publication.publishedRevision ?? "not available"}
          </Badge>
          <span className="text-xs text-muted-foreground">
            Published-state computed {date(zones.publication.computedAt)} · canonical as of{" "}
            {date(zones.asOf)}
          </span>
        </div>
        <ZoneGroup title="Power" unit="W" value={zones.power} />
        <ZoneGroup title="LTHR" unit="bpm" value={zones.heartRate} />
      </CardContent>
    </Card>
  );
}
