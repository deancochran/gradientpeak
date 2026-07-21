import { activityPlanStructureSchemaV3 } from "@repo/core/activity-plan";
import { Badge } from "@repo/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";

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

export function ActivityPlanStructure({ structure }: { structure: unknown }) {
  const parsed = activityPlanStructureSchemaV3.safeParse(structure);

  return (
    <Card data-testid="activity-plan-structure">
      <CardHeader>
        <CardTitle>Workout structure</CardTitle>
        <CardDescription>Ordered segments, intervals, steps, and targets.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!parsed.success ? (
          <p className="text-sm text-destructive">This workout structure cannot be displayed.</p>
        ) : (
          parsed.data.segments.map((segment, segmentIndex) => (
            <section className="rounded-xl border p-4" key={segment.id}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">{segmentIndex + 1}</span>
                <h3 className="font-semibold">{segment.name}</h3>
                <Badge variant="secondary">{segment.role}</Badge>
                {segment.role === "activity" ? (
                  <Badge variant="outline">{segment.category}</Badge>
                ) : null}
              </div>
              {segment.role === "activity" ? (
                <div className="mt-4 space-y-3">
                  {segment.intervals.map((interval) => (
                    <div className="rounded-lg bg-muted/30 p-3" key={interval.id}>
                      <p className="font-medium">
                        {interval.name}
                        {interval.repetitions > 1 ? ` · ${interval.repetitions} rounds` : ""}
                      </p>
                      <ol className="mt-2 space-y-2">
                        {interval.steps.map((step) => (
                          <li
                            className="flex flex-wrap justify-between gap-2 text-sm"
                            key={step.id}
                          >
                            <span>{step.name}</span>
                            <span className="text-muted-foreground">
                              {durationLabel(step.duration)} ·{" "}
                              {step.targets
                                .map((target) => `${target.intensity} ${target.type}`)
                                .join(", ")}
                            </span>
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
