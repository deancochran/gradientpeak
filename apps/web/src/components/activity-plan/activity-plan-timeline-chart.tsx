import {
  type ActivityPlanPresentationModel,
  deriveActivityPlanPresentation,
} from "@repo/core/activity-plan";
import { getIntensityZone, INTENSITY_ZONES } from "@repo/core/constants";

type TimelineOccurrence = ActivityPlanPresentationModel["occurrences"][number];

function occurrenceWeight(duration: TimelineOccurrence["duration"]): number {
  switch (duration.type) {
    case "time":
      return Math.max(1, Math.min(4, duration.seconds / 60));
    case "distance":
      return Math.max(1, Math.min(4, duration.meters / 500));
    case "repetitions":
      return Math.max(1, Math.min(4, duration.count / 5));
    case "untilFinished":
      return 1;
  }
}

function occurrenceHeight(occurrence: TimelineOccurrence, chartHeight: number): number {
  const minimumHeight = Math.min(24, chartHeight);
  if (occurrence.role === "rest" || occurrence.visualIntensity === null) return minimumHeight;
  return minimumHeight + occurrence.visualIntensity * Math.max(0, chartHeight - minimumHeight);
}

function occurrenceColor(occurrence: TimelineOccurrence): string | undefined {
  if (occurrence.role === "rest" || occurrence.visualIntensity === null) return undefined;
  return INTENSITY_ZONES[getIntensityZone(occurrence.visualIntensity * 100)].color;
}

function durationLabel(duration: TimelineOccurrence["duration"]): string {
  switch (duration.type) {
    case "time":
      return `${duration.seconds} seconds`;
    case "distance":
      return `${duration.meters} meters`;
    case "repetitions":
      return `${duration.count} repetitions`;
    case "untilFinished":
      return "until finished";
  }
}

export function ActivityPlanTimelineChart({
  compact = false,
  height = 112,
  label = "Activity prescription timeline",
  presentation,
  structure,
  testIDPrefix = "activity-plan-timeline",
}: {
  compact?: boolean;
  height?: number;
  label?: string;
  presentation?: ActivityPlanPresentationModel | null;
  structure?: unknown;
  testIDPrefix?: string;
}) {
  const model = presentation ?? deriveActivityPlanPresentation(structure);
  if (!model || model.occurrences.length === 0) return null;

  const workCount = model.occurrences.filter((occurrence) => occurrence.role === "activity").length;
  const recoveryCount = model.occurrences.length - workCount;
  const summary = `${label} with ${workCount} work block${workCount === 1 ? "" : "s"} and ${recoveryCount} recovery block${recoveryCount === 1 ? "" : "s"}. Bar widths are normalized and capped from authored duration, distance, or repetitions; bar height and color reflect authored intensity.`;

  return (
    <div
      aria-label={summary}
      className="flex items-end gap-1 overflow-hidden rounded-xl border bg-muted/20"
      data-testid={testIDPrefix}
      role="img"
      style={{ height }}
    >
      {model.occurrences.map((occurrence, index) => (
        <span
          aria-hidden="true"
          className={`min-w-1 rounded-sm border border-border ${occurrence.role === "rest" || occurrence.visualIntensity === null ? "bg-muted-foreground/35" : ""}`}
          data-duration={durationLabel(occurrence.duration)}
          data-intensity={occurrence.intensityLabel ?? "unavailable"}
          data-kind={occurrence.role === "rest" ? "recovery" : "work"}
          data-testid={`${testIDPrefix}-bar-${index}`}
          key={occurrence.occurrenceId}
          style={{
            backgroundColor: occurrenceColor(occurrence),
            flexBasis: 0,
            flexGrow: occurrenceWeight(occurrence.duration),
            height: occurrenceHeight(occurrence, height),
          }}
          title={
            compact
              ? undefined
              : [occurrence.intensityLabel, durationLabel(occurrence.duration)]
                  .filter(Boolean)
                  .join(" · ")
          }
        />
      ))}
    </div>
  );
}
