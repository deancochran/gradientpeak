import type { ActivityStreamAnalysis, StreamAnalysisInsufficientReason } from "@repo/core";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";

type ArtifactState = "error" | "loading" | "missing" | "private" | "processing" | "ready";

type Distribution =
  ActivityStreamAnalysis["distributions"][keyof ActivityStreamAnalysis["distributions"]];

const DISTRIBUTIONS = [
  { key: "heart_rate", title: "Heart rate zones", unit: "bpm" },
  { key: "power", title: "Power zones", unit: "W" },
  { key: "run_pace", title: "Run pace zones", unit: "m/s" },
  { key: "swim_pace", title: "Swim pace zones", unit: "m/s" },
] as const;

function formatDuration(seconds: number): string {
  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainingSeconds = rounded % 60;
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`
    : `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function unavailableCopy(reason: StreamAnalysisInsufficientReason | null): string {
  switch (reason) {
    case "invalid_timestamps":
      return "Unavailable because stream timestamps are invalid.";
    case "insufficient_samples":
      return "Unavailable because too few stream samples were recorded.";
    case "threshold_missing":
      return "Unavailable because no prior sport-specific threshold was available.";
    case "low_coverage":
      return "Unavailable because stream coverage is too low for a reliable distribution.";
    case "sport_mismatch":
      return "Not applicable to this activity sport.";
    default:
      return "Stream analysis is unavailable.";
  }
}

function qualityCopy(distribution: Distribution): string {
  const coverage = Math.round(distribution.quality.coverage_ratio * 100);
  if (distribution.quality.status === "insufficient") {
    return `${unavailableCopy(distribution.quality.reason)} ${coverage}% coverage.`;
  }

  const thresholdIdentity = distribution.threshold_identity;
  const calibration = thresholdIdentity
    ? ` ${thresholdIdentity.estimate ? "Estimated" : "Measured"} ${thresholdIdentity.source.replaceAll("_", " ")} threshold, ${thresholdIdentity.confidence} confidence${thresholdIdentity.stale ? ", stale" : ""}.`
    : "";
  return `Sufficient stream quality · ${coverage}% coverage · ${formatDuration(distribution.quality.integrated_seconds)} analyzed.${calibration}`;
}

function stateCopy(state: Exclude<ArtifactState, "ready">, errorMessage?: string): string {
  switch (state) {
    case "missing":
      return "No activity file is available for stream analysis.";
    case "processing":
      return "The activity file is still processing. Stream analysis will appear when it is ready.";
    case "private":
      return "Stream analysis is private to the activity owner.";
    case "loading":
      return "Loading stream analysis…";
    case "error":
      return errorMessage
        ? `Stream analysis is unavailable: ${errorMessage}`
        : "The activity file could not be loaded for stream analysis.";
  }
}

export function ActivityStreamAnalysisCard({
  analysis,
  artifactState,
  errorMessage,
}: {
  analysis?: ActivityStreamAnalysis;
  artifactState: ArtifactState;
  errorMessage?: string;
}) {
  if (artifactState !== "ready" || !analysis) {
    const state = artifactState === "ready" ? "error" : artifactState;
    return (
      <Card>
        <CardHeader>
          <CardTitle>Stream analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{stateCopy(state, errorMessage)}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stream analysis</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Stream HR Load</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {analysis.heart_rate_load.value == null
              ? "Unavailable"
              : Math.round(analysis.heart_rate_load.value)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {analysis.heart_rate_load.value == null
              ? unavailableCopy(analysis.heart_rate_load.reason)
              : `LTHR-normalized from accepted stream intervals${analysis.heart_rate_load.lthr_bpm ? ` (${analysis.heart_rate_load.lthr_bpm} bpm LTHR)` : ""}.`}{" "}
            This diagnostic does not replace summary training load.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {DISTRIBUTIONS.map(({ key, title, unit }) => {
            const distribution = analysis.distributions[key];
            return (
              <section className="rounded-xl border border-border p-4" key={key}>
                <h3 className="font-medium text-foreground">{title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{qualityCopy(distribution)}</p>
                {distribution.zones.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {distribution.zones.map((zone) => (
                      <div
                        className="flex items-center justify-between gap-3 text-sm"
                        key={zone.zone}
                      >
                        <span className="text-foreground">Zone {zone.zone}</span>
                        <span className="text-muted-foreground">
                          {formatDuration(zone.seconds)} · {Math.round(zone.percentage)}%
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
                {distribution.threshold != null ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Threshold {distribution.threshold.toFixed(key.includes("pace") ? 2 : 0)} {unit}
                  </p>
                ) : null}
              </section>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
