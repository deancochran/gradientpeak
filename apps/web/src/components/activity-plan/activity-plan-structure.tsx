import { activityPlanStructureSchema } from "@repo/core";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { ActivityPlanStructureItems } from "./activity-plan-structure-presentation";

/** Read-only V5 document view. Repeats are intentionally shown once, never expanded. */
export function ActivityPlanStructure({ structure }: { structure: unknown }) {
  const parsed = activityPlanStructureSchema.safeParse(structure);
  return (
    <Card data-testid="activity-plan-structure">
      <CardHeader>
        <CardTitle>Activity structure</CardTitle>
        <CardDescription>Ordered steps, repeats, and fixed targets.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!parsed.success ? (
          <p className="text-sm text-destructive">This activity structure cannot be displayed.</p>
        ) : (
          <ActivityPlanStructureItems
            activityCategory={parsed.data.activity_category}
            items={parsed.data.items}
          />
        )}
      </CardContent>
    </Card>
  );
}
