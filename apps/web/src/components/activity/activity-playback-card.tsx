import {
  PLAYBACK_METRICS,
  PLAYBACK_SPEEDS,
  type PlaybackIndex,
  type PlaybackMetric,
  type PlaybackPosition,
  playbackFrameAt,
} from "@repo/core/recording/playback";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { useId, useMemo, useState } from "react";
import { useActivityPlayback } from "../../hooks/use-activity-playback";
import {
  type AcceptedActivityStreamRecord,
  indexAcceptedActivityRecords,
} from "../../lib/activity-playback";
import { GeographicRouteMap } from "../recording/geographic-route-map";

export type PlaybackAvailability =
  | "ready"
  | "loading"
  | "error"
  | "missing"
  | "private"
  | "processing";
const EMPTY: readonly AcceptedActivityStreamRecord[] = [];
const METRICS: Record<PlaybackMetric, { label: string; unit: string }> = {
  heartRate: { label: "Heart rate", unit: "bpm" },
  power: { label: "Power", unit: "W" },
  cadence: { label: "Cadence", unit: "/min" },
  speed: { label: "Speed", unit: "m/s" },
  distance: { label: "Distance", unit: "m" },
  altitude: { label: "Elevation", unit: "m" },
  temperature: { label: "Temperature", unit: "°C" },
};
function elapsedLabel(ms: number) {
  const seconds = Math.floor(Math.max(0, ms) / 100) / 10;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds % 60).toFixed(1).padStart(4, "0")}`;
}

export function ActivityPlaybackCard({
  records = EMPTY,
  sourceKey,
  availability,
  errorMessage,
  onRetry,
  scopeDescription,
}: {
  records?: readonly AcceptedActivityStreamRecord[];
  sourceKey: string;
  availability: PlaybackAvailability;
  errorMessage?: string;
  onRetry?: () => void;
  scopeDescription?: string;
}) {
  // A refreshed record array owns a new clock/index. Reset before paint, rather
  // than briefly rendering the old cursor against new data in an effect.
  const [revision, setRevision] = useState({ records, number: 0 });
  if (revision.records !== records) setRevision({ records, number: revision.number + 1 });
  const result = useMemo(() => {
    try {
      return { index: indexAcceptedActivityRecords(records), error: null };
    } catch (error) {
      return {
        index: null,
        error: error instanceof Error ? error.message : "Playback data could not be read.",
      };
    }
  }, [records]);
  const messages = {
    loading: "Loading recorded playback…",
    error: errorMessage
      ? `Playback unavailable: ${errorMessage}`
      : "Recorded playback could not be loaded.",
    missing: "No accepted activity file is available for playback.",
    private: "Recorded playback is private to the activity owner.",
    processing:
      "The activity file is still processing. Playback will be available when it is ready.",
  };
  return (
    <Card data-testid="activity-playback">
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          Recorded playback
        </CardTitle>
        <CardDescription>
          {scopeDescription ?? "Read-only playback of the accepted activity stream."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {availability !== "ready" ? (
          <div>
            <p role={availability === "error" ? "alert" : undefined}>{messages[availability]}</p>
            {availability === "error" && onRetry ? (
              <Button type="button" variant="outline" onClick={onRetry}>
                Retry playback
              </Button>
            ) : null}
          </div>
        ) : result.error || !result.index ? (
          <p role="alert">{result.error}</p>
        ) : (
          <PlaybackSession key={`${sourceKey}:${revision.number}`} index={result.index} />
        )}
      </CardContent>
    </Card>
  );
}

function PlaybackSession({ index }: { index: PlaybackIndex }) {
  const available = useMemo(
    () =>
      PLAYBACK_METRICS.filter((key) => index.metrics[key].some((sample) => sample.value !== null)),
    [index],
  );
  const hasPosition = useMemo(
    () => index.positions.some((sample) => sample.value !== null),
    [index],
  );
  const [selected, setSelected] = useState<readonly PlaybackMetric[]>(available);
  const playback = useActivityPlayback(index.durationMs);
  const frame = playbackFrameAt(index, playback.elapsedMs);
  const sliderId = useId();
  const policyId = useId();
  if (!available.length && !hasPosition)
    return (
      <p>No timestamped measurements or recorded GPS positions are available in this segment.</p>
    );
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground" id={policyId}>
        Recorded samples only, with no interpolation. Last samples remain visible for up to 5
        seconds; gaps are unavailable. Seeking pauses playback.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          disabled={index.durationMs === 0}
          onClick={playback.playing ? playback.pause : playback.play}
        >
          {playback.playing ? "Pause playback" : "Play playback"}
        </Button>
        <Button type="button" variant="outline" onClick={() => playback.seek(0)}>
          Restart playback
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={index.durationMs === 0}
          onClick={() => playback.seek(index.durationMs)}
        >
          Jump to end
        </Button>
        <fieldset className="m-0 flex gap-1 border-0 p-0" aria-label="Playback speed">
          <legend className="sr-only">Playback speed</legend>
          {PLAYBACK_SPEEDS.map((speed) => (
            <Button
              key={speed}
              type="button"
              size="sm"
              variant="outline"
              aria-label={`Playback speed ${speed}x`}
              aria-pressed={speed === playback.speed}
              onClick={() => playback.setSpeed(speed)}
            >
              {speed}×
            </Button>
          ))}
        </fieldset>
      </div>
      <div>
        <label className="text-sm font-medium" htmlFor={sliderId}>
          Playback elapsed time
        </label>
        <Input
          id={sliderId}
          type="range"
          min={0}
          max={index.durationMs}
          step={1}
          value={playback.elapsedMs}
          disabled={index.durationMs === 0}
          aria-describedby={policyId}
          aria-valuetext={`${(playback.elapsedMs / 1000).toFixed(3)} seconds of ${(index.durationMs / 1000).toFixed(3)}`}
          onFocus={playback.pause}
          onChange={(event) => playback.seek(Number(event.currentTarget.value))}
          onKeyDown={(event) => {
            const target =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? index.durationMs
                  : event.key === "ArrowRight" || event.key === "ArrowUp"
                    ? playback.elapsedMs + 1000
                    : event.key === "ArrowLeft" || event.key === "ArrowDown"
                      ? playback.elapsedMs - 1000
                      : event.key === "PageUp"
                        ? playback.elapsedMs + 10000
                        : event.key === "PageDown"
                          ? playback.elapsedMs - 10000
                          : null;
            if (target !== null) {
              event.preventDefault();
              playback.seek(target);
            }
          }}
          className="w-full accent-primary"
        />
        <div className="flex justify-between text-sm" aria-live="off">
          <span data-testid="playback-clock">
            {elapsedLabel(playback.elapsedMs)} / {elapsedLabel(index.durationMs)}
          </span>
          <span>{frame.timestampMs === null ? "" : new Date(frame.timestampMs).toISOString()}</span>
        </div>
      </div>
      <p role="status" className="text-sm text-muted-foreground">
        {index.durationMs === 0
          ? "Single recorded instant."
          : playback.playing
            ? "Playing."
            : playback.elapsedMs === index.durationMs
              ? "End of playback."
              : "Paused."}
      </p>
      {available.length ? (
        <fieldset className="m-0 flex flex-wrap gap-2 border-0 p-0" aria-label="Playback metrics">
          <legend className="sr-only">Playback metrics</legend>
          {available.map((key) => (
            <Button
              key={key}
              type="button"
              size="sm"
              variant="outline"
              aria-pressed={selected.includes(key)}
              onClick={() =>
                setSelected((previous) =>
                  previous.includes(key)
                    ? previous.filter((metric) => metric !== key)
                    : [...previous, key],
                )
              }
            >
              {METRICS[key].label}
            </Button>
          ))}
        </fieldset>
      ) : null}
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3" aria-live="off">
        {frame.metrics
          .filter(({ key }) => selected.includes(key))
          .map(({ key, sample }) => (
            <div
              key={key}
              className="rounded-lg border border-border p-3"
              data-testid={`playback-metric-${key}`}
            >
              <dt className="text-sm text-muted-foreground">{METRICS[key].label}</dt>
              <dd className="font-semibold">
                {sample
                  ? `${sample.value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${METRICS[key].unit}`
                  : "Unavailable"}
              </dd>
              {sample ? (
                <dd className="text-xs text-muted-foreground">
                  {sample.ageMs === 0
                    ? "Recorded at this time"
                    : `Last recorded ${(sample.ageMs / 1000).toFixed(1)} s earlier`}
                </dd>
              ) : null}
            </div>
          ))}
      </dl>
      <PlaybackMap index={index} position={frame.position} />
      {index.rejectedRecords || index.duplicateTimestamps ? (
        <p className="text-xs text-muted-foreground">
          {index.rejectedRecords} records with invalid timestamps or shapes ignored.{" "}
          {index.duplicateTimestamps} duplicate timestamps merged by last supplied field; coordinate
          pairs remain together.
        </p>
      ) : null}
    </div>
  );
}

function PlaybackMap({
  index,
  position,
}: {
  index: PlaybackIndex;
  position: ReturnType<typeof playbackFrameAt>["position"];
}) {
  const positions = useMemo(
    () =>
      index.positions.flatMap((sample) =>
        sample.value ? [{ ...sample.value, timestampMs: sample.timestampMs }] : [],
      ),
    [index],
  );
  return (
    <GeographicRouteMap
      coordinates={positions}
      currentPosition={position?.value ?? null}
      {...(position
        ? {
            currentPositionLabel: `Measured playback position recorded ${(position.ageMs / 1000).toFixed(1)} s earlier.`,
          }
        : {})}
      fallback={<RecordedPositionsSchematic positions={positions} position={position} />}
      routeKey={`playback:${positions.length}:${positions[0]?.timestampMs}:${positions.at(-1)?.timestampMs}`}
    />
  );
}

function RecordedPositionsSchematic({
  positions,
  position,
}: {
  positions: readonly (PlaybackPosition & { timestampMs: number })[];
  position: ReturnType<typeof playbackFrameAt>["position"];
}) {
  const plot = useMemo(() => {
    const origin = positions[0];
    if (!origin) return null;
    const longitudeScale = Math.max(0.001, Math.cos((origin.latitude * Math.PI) / 180));
    const raw = (point: PlaybackPosition) => ({
      x: (((point.longitude - origin.longitude + 540) % 360) - 180) * longitudeScale,
      y: -point.latitude,
    });
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const point of positions) {
      const value = raw(point);
      minX = Math.min(minX, value.x);
      maxX = Math.max(maxX, value.x);
      minY = Math.min(minY, value.y);
      maxY = Math.max(maxY, value.y);
    }
    const span = Math.max(maxX - minX, maxY - minY, 0.000001);
    const project = (point: PlaybackPosition) => {
      const value = raw(point);
      return {
        x: 10 + ((value.x - minX + (span - (maxX - minX)) / 2) * 180) / span,
        y: 10 + ((value.y - minY + (span - (maxY - minY)) / 2) * 180) / span,
      };
    };
    const stride = Math.max(1, Math.ceil(positions.length / 2000));
    const dots = positions
      .filter((_, index) => index % stride === 0 || index === positions.length - 1)
      .map((point) => ({ ...project(point), timestampMs: point.timestampMs }));
    return {
      project,
      dots: (
        <g className="text-muted-foreground">
          {dots.map((point) => (
            <circle key={point.timestampMs} cx={point.x} cy={point.y} r={1.5} fill="currentColor" />
          ))}
        </g>
      ),
    };
  }, [positions]);
  if (!plot)
    return (
      <p className="text-sm text-muted-foreground">This segment has no recorded GPS positions.</p>
    );
  const marker = position ? plot.project(position.value) : null;
  return (
    <figure className="space-y-2 rounded-lg border border-border p-3" aria-live="off">
      <figcaption className="text-sm font-medium">
        Recorded positions in this segment (schematic)
      </figcaption>
      <svg
        role="img"
        aria-label={
          position
            ? "Recorded GPS positions with the last recorded playback position"
            : "Recorded GPS positions; no position available at this playback time"
        }
        viewBox="0 0 200 200"
        className="h-64 w-full bg-muted/20"
      >
        {plot.dots}
        {marker && position ? (
          <circle
            data-testid="playback-position-marker"
            data-latitude={position.value.latitude}
            data-longitude={position.value.longitude}
            cx={marker.x}
            cy={marker.y}
            r={4}
            className="text-primary"
            fill="currentColor"
          />
        ) : null}
      </svg>
      <p className="text-sm" data-testid="playback-position">
        {position
          ? `${position.value.latitude.toFixed(5)}, ${position.value.longitude.toFixed(5)} · recorded ${(position.ageMs / 1000).toFixed(1)} s earlier`
          : "No recorded position at this time."}
      </p>
      <p className="text-xs text-muted-foreground">
        Dots are recorded positions, not an interpolated route. Large traces show a reduced
        backdrop; the current marker always uses the actual selected sample.
      </p>
    </figure>
  );
}
