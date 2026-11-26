import {
  deriveTrainingPlanScheduleVisual,
  type TrainingPlanPlannedSchedulePreview as TrainingPlanPlannedSchedulePreviewModel,
} from "@repo/core";

function formatSessionCount(count: number) {
  return `${count} scheduled session${count === 1 ? "" : "s"}`;
}

export function TrainingPlanPlannedPreview({
  compact = false,
  planId,
  preview,
  structure,
}: {
  compact?: boolean;
  planId: string;
  preview?: TrainingPlanPlannedSchedulePreviewModel | null;
  structure?: unknown;
}) {
  const model = deriveTrainingPlanScheduleVisual({ preview, structure });
  if (!model) return null;

  const summary = `${formatSessionCount(model.totalSessions)} · ${model.totalWeeks} week${model.totalWeeks === 1 ? "" : "s"}`;
  const accessibilityLabel = `Plan schedule. ${formatSessionCount(model.totalSessions)} across ${model.totalWeeks} weeks. Bar height shows scheduled sessions per week; empty weeks have a baseline only. This is not athlete-specific training load.`;

  return (
    <section
      aria-label={accessibilityLabel}
      className={`overflow-hidden rounded-2xl border border-primary/20 bg-primary/5 ${compact ? "space-y-1.5 px-2.5 py-2" : "space-y-2 px-3 py-3"}`}
      data-testid={`training-plan-planned-preview-${planId}`}
      role="img"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">Plan schedule</p>
        <p className="text-xs text-muted-foreground">{summary}</p>
      </div>

      <div
        aria-hidden="true"
        className={`flex items-end ${model.totalWeeks > 20 ? "gap-0" : "gap-1"} ${compact ? "h-20" : "h-28"}`}
      >
        {model.weeks.map((week) => {
          const isEmpty = week.plannedSessionCount === 0;

          return (
            <div
              className="flex h-full min-w-0 flex-1 flex-col items-center justify-end"
              data-testid={`training-plan-visual-week-${week.weekIndex}`}
              key={`training-plan-week-${week.weekIndex}`}
            >
              {week.hasAuthoredGoal ? (
                <span
                  className="mb-1 block size-2 shrink-0 rounded-full bg-amber-400"
                  data-testid={`training-plan-visual-goal-${week.weekIndex}`}
                />
              ) : (
                <span className="mb-1 block h-2 shrink-0" />
              )}
              <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-end">
                {isEmpty ? (
                  <div
                    className="h-0.5 w-full rounded-full bg-border/70"
                    data-testid={`training-plan-visual-empty-${week.weekIndex}`}
                  />
                ) : (
                  <div
                    className="w-full overflow-hidden rounded-t-lg border-x border-t border-primary/30 bg-primary/20"
                    data-testid={`training-plan-visual-bar-${week.weekIndex}`}
                    style={{ height: `${(compact ? 12 : 10) + week.relativeSessionVolume * 82}%` }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {compact ? null : (
        <p className="text-xs text-muted-foreground">
          Bars show scheduled sessions per week. Empty weeks use a baseline only; this is not
          personalized training load.
        </p>
      )}
    </section>
  );
}
