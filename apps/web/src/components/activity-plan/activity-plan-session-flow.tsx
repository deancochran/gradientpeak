import {
  type ActivityPlanDuration,
  deriveActivityPlanPresentation,
  getActivityPlanSessionFlowTargetPresentations,
  resolveActivityPlanSessionFlow,
} from "@repo/core/activity-plan";
import type { AthletePerformanceTargetFacts } from "@repo/core/performance-model";
import { Badge } from "@repo/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { ActivityPlanTimelineChart } from "./activity-plan-timeline-chart";
import { toRenderableActivityPlanStructure } from "./renderable-activity-plan-structure";

function durationLabel(duration: ActivityPlanDuration): string {
  switch (duration.type) {
    case "time": {
      const minutes = Math.floor(duration.seconds / 60);
      const seconds = duration.seconds % 60;
      return minutes > 0 && seconds > 0
        ? `${minutes}m ${seconds}s`
        : minutes > 0
          ? `${minutes}m`
          : `${seconds}s`;
    }
    case "distance":
      return duration.meters >= 1_000
        ? `${Math.round((duration.meters / 1_000) * 100) / 100} km`
        : `${duration.meters} m`;
    case "repetitions":
      return `${duration.count} reps`;
    case "untilFinished":
      return "Until finished";
  }
}

export function ActivityPlanSessionFlow({
  structure,
  performanceTargets,
  personalizeTargets = false,
  onPersonalizeTargetsChange,
  showPersonalizationControl = false,
  showStepNames = true,
  personalizationFactsLoading = false,
}: {
  structure: unknown;
  performanceTargets?: AthletePerformanceTargetFacts | null;
  personalizeTargets?: boolean;
  onPersonalizeTargetsChange?: (enabled: boolean) => void;
  showPersonalizationControl?: boolean;
  showStepNames?: boolean;
  personalizationFactsLoading?: boolean;
}) {
  const resolution = resolveActivityPlanSessionFlow({
    structure: toRenderableActivityPlanStructure(structure),
    ...(performanceTargets ? { performanceTargets } : {}),
    personalize: personalizeTargets,
  });
  const presentation = deriveActivityPlanPresentation(resolution.structure);
  if (!presentation || presentation.occurrences.length === 0) return null;
  const factsPending = personalizationFactsLoading && !resolution.eligibility.eligible;
  const personalizationDisabled = factsPending || !resolution.eligibility.eligible;
  const personalizationReason = factsPending
    ? "Checking whether every target can be represented with your current physical values."
    : resolution.eligibility.reason;

  return (
    <Card data-testid="activity-plan-session-flow">
      <CardHeader>
        <CardTitle>Session Flow</CardTitle>
        <CardDescription>
          Ordered work and recovery, followed by a compact segment breakdown.
        </CardDescription>
        {showPersonalizationControl && onPersonalizeTargetsChange ? (
          <div className="mt-3 flex items-center justify-between gap-4 rounded-lg border px-3 py-2 print:hidden">
            <div>
              <p className="text-sm font-medium">Personalize targets</p>
              <p className="text-xs text-muted-foreground">
                {personalizationReason ??
                  "All targets have physical values. Turn this off to see the authored targets."}
              </p>
            </div>
            <button
              aria-checked={personalizeTargets && !personalizationDisabled}
              aria-label="Personalize targets"
              className="rounded-full border px-3 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50"
              disabled={personalizationDisabled}
              onClick={() => onPersonalizeTargetsChange(!personalizeTargets)}
              role="switch"
              type="button"
            >
              {personalizeTargets && !personalizationDisabled ? "On" : "Off"}
            </button>
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <ActivityPlanTimelineChart
            label="Session flow"
            presentation={presentation}
            testIDPrefix="activity-plan-session-flow-timeline"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Bar widths are normalized and capped from authored duration, distance, or repetitions.
            Bar height reflects relative plan intensity when a comparable target is available.
          </p>
        </div>

        <ol className="grid gap-3 lg:grid-cols-2">
          {presentation.structure.segments.map((segment, segmentIndex) => (
            <li className="rounded-xl border p-4" key={segment.id}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">{segmentIndex + 1}</span>
                <h3 className="font-semibold">{segment.name}</h3>
                <Badge variant={segment.role === "activity" ? "secondary" : "outline"}>
                  {segment.role === "activity" ? "Work" : "Recovery"}
                </Badge>
              </div>
              {segment.notes ? (
                <p className="mt-2 text-sm text-muted-foreground">{segment.notes}</p>
              ) : null}
              {segment.role === "activity" ? (
                <div className="mt-3 space-y-3">
                  {segment.intervals.map((interval) => (
                    <div key={interval.id}>
                      <p className="text-sm font-medium">
                        {interval.name} · {interval.repetitions}×
                      </p>
                      {interval.notes ? (
                        <p className="mt-1 text-sm text-muted-foreground">{interval.notes}</p>
                      ) : null}
                      <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                        {interval.steps.map((step, stepIndex) => (
                          <li key={step.id}>
                            {showStepNames ? step.name : `Step ${stepIndex + 1}`} ·{" "}
                            {durationLabel(step.duration)}
                            {getActivityPlanSessionFlowTargetPresentations(resolution, step.id).map(
                              (target) => (
                                <span key={`${step.id}-${target.sourceLabel}`}>
                                  {" "}
                                  · {target.label}
                                </span>
                              ),
                            )}
                            {step.description ? <p className="mt-1">{step.description}</p> : null}
                            {step.notes ? <p className="mt-1">{step.notes}</p> : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  {durationLabel(segment.duration)}
                </p>
              )}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
