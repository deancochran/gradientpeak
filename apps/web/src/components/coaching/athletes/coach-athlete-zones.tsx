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
    : "not available";
}

const cardTheme = "border-primary/30 bg-background text-foreground";
const mutedText = "text-muted-foreground";

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
      className="rounded-xl border border-border bg-card p-4 text-foreground"
      aria-label={title}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">{title}</h3>
        <Badge
          className={
            value.zoneAvailability === "available"
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-border bg-muted text-foreground"
          }
          variant={value.zoneAvailability === "available" ? "secondary" : "outline"}
        >
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
        <p className={`mt-2 text-sm ${mutedText}`}>Threshold unavailable. No ranges are shown.</p>
      )}
      {source.availability === "available" ? (
        <p className={`mt-1 text-xs ${mutedText}`}>
          Threshold state: {label(source.state)} · freshness: {label(source.freshness)} ·
          provenance: {label(source.provenance)} · effective at {date(source.effectiveAt)}
        </p>
      ) : null}
      {value.zones ? (
        <>
          <p className={`mt-3 text-xs ${mutedText}`}>
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
      <Card className={cardTheme} data-testid="coach-athlete-zones">
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
                <Button
                  className="border-primary/30 bg-card text-foreground hover:bg-muted"
                  type="button"
                  variant="outline"
                  onClick={onRetry}
                  disabled={retryPending}
                >
                  Retry bike zones
                </Button>
              ) : null}
            </div>
          ) : (
            <p className={`text-sm ${mutedText}`}>Loading bike zones…</p>
          )}
        </CardContent>
      </Card>
    );
  if (!result) return null;
  if (result.status === "forbidden")
    return (
      <Card className={cardTheme} data-testid="coach-athlete-zones">
        <CardHeader>
          <CardTitle>
            <h2>Bike zones</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className={`text-sm ${mutedText}`}>Bike metrics are not available for this athlete.</p>
        </CardContent>
      </Card>
    );
  const { zones } = result;
  return (
    <Card
      className={cardTheme}
      data-testid="coach-athlete-zones"
      data-organization={identity.organizationId}
      data-athlete={identity.athleteProfileId}
    >
      <CardHeader>
        <CardTitle>
          <h2>Bike zones</h2>
        </CardTitle>
        <CardDescription className={mutedText}>
          Canonical cycling thresholds; this is not a readiness or approval assessment.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge
            className={
              zones.publication.status === "available"
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border bg-muted text-foreground"
            }
            variant={zones.publication.status === "available" ? "secondary" : "outline"}
          >
            Publication status: {zones.publication.status}
          </Badge>
          <Badge className="border-border bg-muted text-foreground" variant="outline">
            {zones.publication.status === "unavailable" ||
            zones.publication.publishedRevision === null
              ? "Publication revision: not available"
              : `Publication revision: ${zones.publication.publishedRevision}`}
          </Badge>
          <span className={`text-xs ${mutedText}`}>
            Publication computed at {date(zones.publication.computedAt)} · canonical as of{" "}
            {date(zones.asOf)}
          </span>
        </div>
        <ZoneGroup title="Power" unit="W" value={zones.power} />
        <ZoneGroup title="LTHR" unit="bpm" value={zones.heartRate} />
      </CardContent>
    </Card>
  );
}
