import {
  activityPlanStructureSchema,
  consolidateActivityPlanText,
  orderActivityPlanTargetsForPresentation,
  resolveActivityPlanTargetPresentation,
} from "@repo/core";
import { Badge } from "@repo/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { toRenderableActivityPlanStructure } from "./renderable-activity-plan-structure";

function durationLabel(duration: {
  type: string;
  seconds?: number;
  meters?: number;
  count?: number;
}) {
  if (duration.type === "time") return `${duration.seconds ?? 0} sec`;
  if (duration.type === "distance") return `${duration.meters ?? 0} m`;
  if (duration.type === "repetitions") return `${duration.count ?? 0} reps`;
  return "Until finished";
}

function targetLabel({
  target,
  activityCategory,
  asOf,
}: Parameters<typeof resolveActivityPlanTargetPresentation>[0]): string {
  const presentation = resolveActivityPlanTargetPresentation({
    target,
    activityCategory,
    asOf,
  });
  return presentation.label;
}

export function ActivityPlanStructure({ structure }: { structure: unknown }) {
  const parsed = activityPlanStructureSchema.safeParse(
    toRenderableActivityPlanStructure(structure),
  );
  const presentationTime = "1970-01-01T00:00:00.000Z";

  return (
    <Card data-testid="activity-plan-structure">
      <CardHeader>
        <CardTitle>Activity structure</CardTitle>
        <CardDescription>Ordered segments, intervals, steps, and targets.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!parsed.success ? (
          <p className="text-sm text-destructive">This activity structure cannot be displayed.</p>
        ) : (
          parsed.data.segments.map((segment, segmentIndex) => (
            <section className="rounded-xl border p-4" key={segment.id}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">{segmentIndex + 1}</span>
                <h3 className="font-semibold">{segment.name}</h3>
                <Badge variant="secondary">{segment.role}</Badge>
                {segment.role === "activity" ? (
                  <Badge variant="outline">{parsed.data.activity_category}</Badge>
                ) : null}
              </div>
              {segment.notes ? (
                <p className="mt-2 text-sm text-muted-foreground">{segment.notes}</p>
              ) : null}
              {segment.role === "activity" ? (
                <div className="mt-4 space-y-3">
                  {segment.intervals.map((interval) => (
                    <div className="rounded-lg bg-muted/30 p-3" key={interval.id}>
                      <p className="font-medium">
                        {interval.name}
                        {interval.repetitions > 1 ? ` · ${interval.repetitions} rounds` : ""}
                      </p>
                      {interval.notes ? (
                        <p className="mt-1 text-sm text-muted-foreground">{interval.notes}</p>
                      ) : null}
                      <ol className="mt-2 space-y-2">
                        {interval.steps.map((step) => (
                          <li className="text-sm" key={step.id}>
                            <div className="flex flex-wrap justify-between gap-2">
                              <span>{step.name}</span>
                              <span className="text-muted-foreground">
                                {durationLabel(step.duration)} ·{" "}
                                {orderActivityPlanTargetsForPresentation(step.targets)
                                  .map((target) =>
                                    targetLabel({
                                      target,
                                      activityCategory: parsed.data.activity_category,
                                      asOf: presentationTime,
                                    }),
                                  )
                                  .join(", ")}
                              </span>
                            </div>
                            {consolidateActivityPlanText(
                              step.notes,
                              step.description,
                              "Description",
                            ) ? (
                              <p className="mt-1 text-muted-foreground">
                                {consolidateActivityPlanText(
                                  step.notes,
                                  step.description,
                                  "Description",
                                )}
                              </p>
                            ) : null}
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  {durationLabel(segment.duration)}
                </p>
              )}
            </section>
          ))
        )}
      </CardContent>
    </Card>
  );
}
