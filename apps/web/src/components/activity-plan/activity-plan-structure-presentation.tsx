import {
  type ActivityPlanItem,
  type ActivityPlanStep,
  type activityPlanStructureSchema,
  orderActivityPlanTargetsForPresentation,
  resolveActivityPlanTargetPresentation,
} from "@repo/core";
import { Badge } from "@repo/ui/components/badge";
import type { HTMLAttributes, ReactNode } from "react";

type ActivityPlanStructureStepRenderProps = { step: ActivityPlanStep; stepIndex: number };

export function formatActivityPlanDuration(duration: ActivityPlanStep["duration"]) {
  if (duration.type === "time") return `${duration.seconds} sec`;
  if (duration.type === "distance") return `${duration.meters} m`;
  if (duration.type === "repetitions") return `${duration.count} reps`;
  return "Until finished";
}

/** Renders authored items once: repeats are labelled but never expanded for presentation. */
export function ActivityPlanStructureItems({
  activityCategory,
  items,
  showStepNames = true,
}: {
  activityCategory: ReturnType<typeof activityPlanStructureSchema.parse>["activity_category"];
  items: readonly ActivityPlanItem[];
  showStepNames?: boolean;
}) {
  return (
    <ol className="space-y-4">
      {items.map((item, index) => (
        <ActivityPlanStructureItem
          activityCategory={activityCategory}
          item={item}
          itemIndex={index}
          key={item.id}
          showStepNames={showStepNames}
        />
      ))}
    </ol>
  );
}

export function ActivityPlanStructureItem({
  activityCategory,
  item,
  itemIndex,
  getStepProps,
  renderStep,
  renderStepActions,
  showStepNames = true,
}: {
  activityCategory: ReturnType<typeof activityPlanStructureSchema.parse>["activity_category"];
  item: ActivityPlanItem;
  itemIndex: number;
  getStepProps?: (props: ActivityPlanStructureStepRenderProps) => HTMLAttributes<HTMLLIElement>;
  renderStep?: (props: ActivityPlanStructureStepRenderProps) => ReactNode;
  renderStepActions?: (props: ActivityPlanStructureStepRenderProps) => ReactNode;
  showStepNames?: boolean;
}) {
  const steps = item.type === "step" ? [item] : item.steps;
  return (
    <li className="rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">
          {item.type === "repeat" ? `Repeat ${itemIndex + 1}` : `Step ${itemIndex + 1}`}
        </h3>
        {item.type === "repeat" ? (
          <Badge variant="secondary">Repeat {item.count} times</Badge>
        ) : null}
        <Badge variant="outline">{activityCategory}</Badge>
      </div>
      <ol className="mt-3 space-y-2">
        {steps.map((step, stepIndex) => {
          const props = { step, stepIndex };
          return (
            <li
              className="min-w-0 rounded-lg bg-muted/30 p-3 text-sm"
              id={`activity-plan-step-${step.id}`}
              key={step.id}
              {...getStepProps?.(props)}
            >
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  {renderStep?.(props) ?? (
                    <>
                      <div className="flex flex-wrap justify-between gap-2">
                        <span>
                          {showStepNames
                            ? step.name || `Step ${stepIndex + 1}`
                            : `Step ${stepIndex + 1}`}
                        </span>
                        <span className="text-muted-foreground">
                          {formatActivityPlanDuration(step.duration)}
                          {step.targets.length
                            ? ` · ${orderActivityPlanTargetsForPresentation(step.targets)
                                .map(
                                  (target) =>
                                    resolveActivityPlanTargetPresentation({
                                      target,
                                      activityCategory,
                                      asOf: "1970-01-01T00:00:00.000Z",
                                    }).label,
                                )
                                .join(", ")}`
                            : ""}
                        </span>
                      </div>
                      {step.instructions ? (
                        <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                          {step.instructions}
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
                {renderStepActions?.(props)}
              </div>
            </li>
          );
        })}
      </ol>
    </li>
  );
}
