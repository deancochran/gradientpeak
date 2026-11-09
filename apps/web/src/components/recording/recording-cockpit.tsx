import { deriveActivityPlanPresentation } from "@repo/core/activity-plan";
import { Button } from "@repo/ui/components/button";
import type { ReactNode } from "react";
import { useState } from "react";
import {
  buildElevationPolylinePoints,
  type RouteCoordinate,
} from "../../lib/activity-route-helpers";
import { ActivityPlanTimelineChart } from "../activity-plan/activity-plan-timeline-chart";
import { GeographicRouteMap } from "./geographic-route-map";
import { RoutePreviewMap } from "./route-preview-map";

type RouteReference = {
  name: string;
  totalAscent: number | null;
  totalDistance: number | null;
  coordinates: RouteCoordinate[];
  source: "full" | "preview" | "none";
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
};

type Telemetry = {
  status: "unavailable" | "idle" | "connecting" | "connected" | "disconnected" | "error";
  metrics: {
    heartRateBpm: number | null;
    powerWatts: number | null;
    cadenceRpm: number | null;
    speedKph: number | null;
  };
};

export function RecordingCockpit({
  controls,
  currentOccurrenceId,
  currentStep,
  elapsedSeconds,
  lifecycle,
  nextStep,
  onOpenDevices,
  onOpenGuidance,
  plan,
  route,
  stepCommands,
  stepElapsed,
  stepPosition,
  stepRemaining,
  telemetry,
  targetLabels,
}: {
  controls: ReactNode;
  currentOccurrenceId: string | null;
  currentStep: string;
  elapsedSeconds: number;
  lifecycle: string;
  nextStep: string | null;
  onOpenDevices: () => void;
  onOpenGuidance: () => void;
  plan: { name: string; structure: unknown } | null;
  route: RouteReference | null;
  stepCommands: ReactNode;
  stepElapsed: number | null;
  stepPosition: string;
  stepRemaining: number | null;
  telemetry: Telemetry;
  targetLabels: string[];
}) {
  const [inspection, setInspection] = useState<{ structure: unknown; occurrenceId: string } | null>(
    null,
  );
  const presentation = deriveActivityPlanPresentation(plan?.structure);
  const inspected =
    inspection?.structure === plan?.structure
      ? presentation?.occurrences.find(
          (occurrence) => occurrence.occurrenceId === inspection?.occurrenceId,
        )
      : undefined;
  const selectedOccurrenceId = inspected?.occurrenceId ?? currentOccurrenceId;
  const elevationPoints = route ? buildElevationPolylinePoints(route.coordinates) : null;
  const hasGeometry = Boolean(route && route.coordinates.length > 1);

  return (
    <section
      aria-label="Recording cockpit"
      data-lifecycle={lifecycle}
      className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]"
    >
      <div className="min-w-0 space-y-3 rounded-2xl border bg-card p-3 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Elapsed time</p>
            <p
              role="timer"
              aria-label={`Elapsed time ${formatTimer(elapsedSeconds)}`}
              className="font-mono text-4xl font-semibold tabular-nums sm:text-6xl"
            >
              {formatTimer(elapsedSeconds)}
            </p>
          </div>
          <p className="rounded-full bg-muted px-2 py-1 text-xs font-medium sm:text-sm">
            {stepPosition}
          </p>
        </div>
        <div className="grid gap-3 rounded-xl bg-muted/40 p-3 sm:p-4 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {currentOccurrenceId ? "Current step" : "Ready preview"}
            </p>
            <p className="mt-1 text-xl font-semibold">{currentStep}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Plan target: </span>
              <span>{targetLabels.join(" · ") || "No authored target guidance"}</span>
            </p>
            {stepElapsed !== null ? (
              <p className="mt-2 text-sm">
                Elapsed: {formatTimer(stepElapsed)}
                {stepRemaining !== null ? ` · Remaining: ${formatTimer(stepRemaining)}` : ""}
              </p>
            ) : null}
            {stepElapsed !== null && stepRemaining !== null && stepElapsed + stepRemaining > 0 ? (
              <progress
                className="mt-2 h-2 w-full accent-primary"
                aria-label="Current interval progress"
                value={stepElapsed}
                max={stepElapsed + stepRemaining}
              />
            ) : null}
            {nextStep ? (
              <p className="mt-2 text-sm">
                <span className="text-muted-foreground">Next: </span>
                {nextStep}
              </p>
            ) : null}
            {stepCommands}
          </div>
          <LiveTelemetry telemetry={telemetry} />
        </div>
        <div className="sticky bottom-2 z-10 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur">
          {controls}
        </div>
        <nav aria-label="Recording setup" className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onOpenGuidance} type="button">
            Plan
          </Button>
          <Button variant="outline" onClick={onOpenGuidance} type="button">
            Route
          </Button>
          <Button variant="outline" onClick={onOpenDevices} type="button">
            Devices
          </Button>
        </nav>
        {plan ? (
          <div className="space-y-2" data-testid="recording-plan-surface">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold">{plan.name}</h2>
              <span className="hidden text-sm text-muted-foreground sm:inline">
                Select a block to inspect; it will not change the live step.
              </span>
            </div>
            <ActivityPlanTimelineChart
              height={112}
              label="Live interval timeline"
              occurrenceActionLabel="Inspect interval"
              onOccurrenceSelect={(occurrence) =>
                setInspection({ structure: plan.structure, occurrenceId: occurrence.occurrenceId })
              }
              selectedOccurrenceId={selectedOccurrenceId}
              presentation={presentation}
              testIDPrefix="recording-cockpit-timeline"
            />
            {inspected ? (
              <div className="rounded-md border p-2 text-sm" role="status">
                <p>
                  Interval {(presentation?.occurrences.indexOf(inspected) ?? 0) + 1}:{" "}
                  {inspected.intensityLabel ?? "No target"} · {intervalDuration(inspected.duration)}
                  . Live step is unchanged.
                </p>
                <Button size="sm" variant="ghost" onClick={() => setInspection(null)}>
                  Follow current interval
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            Free activity: no interval plan is attached. Use <strong>Plan</strong> to attach one;
            setup is optional.
          </div>
        )}
      </div>
      <aside
        className="min-w-0 rounded-2xl border bg-card p-4 shadow-sm sm:p-6"
        data-testid="recording-route-surface"
      >
        <div className="mb-3">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Route reference · no live GPS
          </p>
          <h2 className="break-words text-xl font-semibold">
            {route?.name ?? "No route attached"}
          </h2>
          {route ? (
            <p className="text-sm text-muted-foreground">
              {route.totalDistance == null
                ? "Distance unavailable"
                : `${(route.totalDistance / 1000).toFixed(1)} km`}
              {route.totalAscent == null
                ? " · Ascent unavailable"
                : ` · ${Math.round(route.totalAscent)} m ascent`}
            </p>
          ) : null}
        </div>
        {!route ? (
          <div className="flex h-60 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
            Attach a route from Route when you want a reference.
          </div>
        ) : null}
        {route?.loading && !hasGeometry ? (
          <div className="flex h-60 items-center justify-center rounded-xl border text-sm text-muted-foreground">
            Loading stored route geometry…
          </div>
        ) : null}
        {hasGeometry ? (
          <GeographicRouteMap
            coordinates={route?.coordinates ?? []}
            fallback={<RoutePreviewMap coordinates={route?.coordinates ?? []} />}
            routeKey={`${route?.name ?? "route"}:${route?.coordinates.length ?? 0}`}
          />
        ) : null}
        {route?.error ? (
          <p className="mt-2 text-sm text-destructive">
            Stored route file could not load; showing saved route preview when available.{" "}
            <button className="underline" onClick={route.onRetry} type="button">
              Retry route
            </button>
          </p>
        ) : null}
        {route && !route.loading && !hasGeometry ? (
          <div className="flex h-60 items-center justify-center rounded-xl border border-dashed text-center text-sm text-muted-foreground">
            No route geometry is available.{" "}
            {route.source === "preview"
              ? "The saved route preview could not be decoded."
              : "This route has no stored reference geometry."}
          </div>
        ) : null}
        {route?.source === "preview" ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Preview geometry from route metadata; elevation is not inferred.
          </p>
        ) : null}
        {elevationPoints ? (
          <svg
            aria-label="Route elevation profile"
            className="mt-3 h-20 w-full rounded border bg-muted/20 p-2"
            preserveAspectRatio="none"
            viewBox="0 0 100 100"
          >
            <polyline
              className="text-primary"
              fill="none"
              points={elevationPoints}
              stroke="currentColor"
              strokeWidth="2.5"
            />
          </svg>
        ) : null}
      </aside>
    </section>
  );
}

function LiveTelemetry({ telemetry }: { telemetry: Telemetry }) {
  const status = telemetryStatusLabel(telemetry.status);
  return (
    <section aria-label={`Live telemetry: ${status}`} className="min-w-0">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Measured now
        </p>
        <p className="text-xs text-muted-foreground">{status}</p>
      </div>
      <dl className="grid grid-cols-4 gap-1 sm:gap-2 lg:grid-cols-2">
        <TelemetryMetric
          available={telemetry.status === "connected"}
          label="HR"
          unit="bpm"
          value={telemetry.metrics.heartRateBpm}
        />
        <TelemetryMetric
          available={telemetry.status === "connected"}
          label="Power"
          unit="W"
          value={telemetry.metrics.powerWatts}
        />
        <TelemetryMetric
          available={telemetry.status === "connected"}
          label="Cadence"
          unit="rpm"
          value={telemetry.metrics.cadenceRpm}
        />
        <TelemetryMetric
          available={telemetry.status === "connected"}
          label="Speed"
          unit="km/h"
          value={telemetry.metrics.speedKph}
        />
      </dl>
    </section>
  );
}

function TelemetryMetric({
  available,
  label,
  unit,
  value,
}: {
  available: boolean;
  label: string;
  unit: string;
  value: number | null;
}) {
  const measured = available && value !== null && Number.isFinite(value) && value >= 0;
  return (
    <div className="min-w-0 rounded-lg border bg-background/70 px-1 py-1.5 sm:px-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono text-sm font-semibold tabular-nums sm:text-lg">
        {measured ? `${formatMetric(value)} ${unit}` : "—"}
      </dd>
    </div>
  );
}

function telemetryStatusLabel(status: Telemetry["status"]) {
  if (status === "connected") return "Connected";
  if (status === "connecting") return "Connecting";
  if (status === "unavailable") return "Bluetooth unavailable";
  if (status === "disconnected") return "Disconnected";
  if (status === "error") return "Connection error";
  return "No device connected";
}

function formatMetric(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatTimer(seconds: number) {
  return [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

function intervalDuration(duration: {
  type: string;
  seconds?: number;
  meters?: number;
  count?: number;
}) {
  if (duration.type === "time") return `${duration.seconds} seconds`;
  if (duration.type === "distance") return `${duration.meters} metres`;
  if (duration.type === "repetitions") return `${duration.count} repetitions`;
  return "Open-ended step";
}
