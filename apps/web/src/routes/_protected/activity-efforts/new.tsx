import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/activity-efforts/new")({
  component: ActivityEffortReadOnlyPage,
});

function ActivityEffortReadOnlyPage() {
  return (
    <div className="container mx-auto max-w-3xl py-4">
      <Card>
        <CardHeader>
          <CardTitle>Activity efforts are read-only</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            GradientPeak calculates efforts from trusted recorded activity data. Manual effort
            creation is no longer available.
          </p>
          <Link className="text-sm font-medium underline underline-offset-4" to="/activity-efforts">
            View activity efforts
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
