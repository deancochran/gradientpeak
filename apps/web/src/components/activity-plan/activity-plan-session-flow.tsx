import { activityPlanStructureSchema } from "@repo/core";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { ActivityPlanStructureItems } from "./activity-plan-structure-presentation";
import { ActivityPlanTimelineChart } from "./activity-plan-timeline-chart";

/** Displays exactly the authored V5 sequence; it never personalizes or scales targets. */
export function ActivityPlanSessionFlow({
  structure,
  showStepNames = true,
}: {
  structure: unknown;
  showStepNames?: boolean;
}) {
  const parsed = activityPlanStructureSchema.safeParse(structure);
  if (!parsed.success) return null;
  return (
    <Card data-testid="activity-plan-session-flow">
      <CardHeader>
        <CardTitle>Session Flow</CardTitle>
        <CardDescription>Ordered fixed steps, repeats, and targets.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <ActivityPlanTimelineChart
          label="Session flow"
          presentation={null}
          structure={parsed.data}
          testIDPrefix="activity-plan-session-flow-timeline"
        />
        <ActivityPlanStructureItems
          activityCategory={parsed.data.activity_category}
          items={parsed.data.items}
          showStepNames={showStepNames}
        />
      </CardContent>
    </Card>
  );
}
