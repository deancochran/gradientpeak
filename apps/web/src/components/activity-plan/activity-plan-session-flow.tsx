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

function stepInstruction(input: {
  duration: ActivityPlanDuration;
  targets: readonly string[];
}): string {
  const duration = durationLabel(input.duration);
  return input.targets.length > 0 ? `${duration} at ${input.targets.join(" · ")}` : duration;
}

function intervalLabel(value: string, repetitions: number): string | null {
  const name = /^interval\s+\d+$/iu.test(value.trim()) ? null : value;
  return (
    [name, repetitions > 1 ? `Repeat ${repetitions}×` : null].filter(Boolean).join(" · ") || null
  );
}

function isRedundantActivitySegmentLabel(value: string, activityCategory: string): boolean {
  const normalized = value.trim().toLocaleLowerCase();
  const category = activityCategory.trim().toLocaleLowerCase();
  return normalized === category || normalized === `${category} activity`;
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
  const timelinePresentation = deriveActivityPlanPresentation(resolution.authoredStructure);
  if (!presentation || presentation.occurrences.length === 0) return null;
  const factsPending = personalizationFactsLoading && !resolution.eligibility.eligible;
  const personalizationDisabled = factsPending || !resolution.eligibility.eligible;

  return (
    <Card data-testid="activity-plan-session-flow">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <CardTitle>Session Flow</CardTitle>
          {showPersonalizationControl && onPersonalizeTargetsChange ? (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Calculated targets</span>
              <button
                aria-checked={personalizeTargets && !personalizationDisabled}
                aria-label="Calculated targets"
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
        </div>
        <CardDescription>
          Ordered work and recovery, followed by a compact segment breakdown.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <ActivityPlanTimelineChart
            label="Session flow"
            presentation={timelinePresentation}
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
              {segment.role !== "activity" ||
              !isRedundantActivitySegmentLabel(
                segment.name,
                presentation.structure.activity_category,
              ) ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">{segmentIndex + 1}</span>
                  <h3 className="text-base font-semibold">{segment.name}</h3>
                  {segment.role !== "activity" ? <Badge variant="outline">Recovery</Badge> : null}
                </div>
              ) : null}
              {segment.notes ? (
                <p className="mt-2 text-sm text-muted-foreground">{segment.notes}</p>
              ) : null}
              {segment.role === "activity" ? (
                <div
                  className={
                    isRedundantActivitySegmentLabel(
                      segment.name,
                      presentation.structure.activity_category,
                    )
                      ? "space-y-5"
                      : "mt-4 space-y-5"
                  }
                >
                  {segment.intervals.map((interval) => (
                    <div
                      className={
                        interval.repetitions > 1 ? "border-l-2 border-primary/30 pl-3" : undefined
                      }
                      key={interval.id}
                    >
                      {intervalLabel(interval.name, interval.repetitions) ? (
                        <p className="text-base leading-5 text-foreground">
                          {intervalLabel(interval.name, interval.repetitions)}
                        </p>
                      ) : null}
                      {interval.notes ? (
                        <p className="mt-1 text-sm text-muted-foreground">{interval.notes}</p>
                      ) : null}
                      <ul className="mt-2 space-y-5 text-sm text-muted-foreground">
                        {interval.steps.map((step, stepIndex) => (
                          <li className="space-y-1.5" key={step.id}>
                            <p className="text-base font-semibold leading-5 text-foreground">
                              {showStepNames ? step.name : `Step ${stepIndex + 1}`}
                            </p>
                            <p className="text-sm leading-5 text-foreground">
                              {stepInstruction({
                                duration: step.duration,
                                targets: getActivityPlanSessionFlowTargetPresentations(
                                  resolution,
                                  step.id,
                                ).map((target) => target.label),
                              })}
                            </p>
                            {step.description ? (
                              <p className="mt-1 text-sm leading-5 text-muted-foreground">
                                {step.description}
                              </p>
                            ) : null}
                            {step.notes ? (
                              <p className="text-sm leading-5 text-muted-foreground">
                                {step.notes}
                              </p>
                            ) : null}
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
