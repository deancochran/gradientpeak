import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import {
  ActivityEffortListCard,
  DetailPageIntro,
} from "../../../components/protected/activity-route-primitives";
import { api } from "../../../lib/api/client";

export const Route = createFileRoute("/_protected/activity-efforts/")({
  component: ActivityEffortsPage,
});

function ActivityEffortsPage() {
  const navigate = Route.useNavigate();
  const effortsQuery = api.activityEfforts.getForProfile.useQuery();
  const efforts = effortsQuery.data ?? [];

  return (
    <div className="container mx-auto max-w-5xl space-y-6 py-4">
      <DetailPageIntro
        actions={
          <Button onClick={() => void navigate({ to: "/activity-efforts/new" })} type="button">
            <Plus className="mr-2 h-4 w-4" />
            Add effort
          </Button>
        }
        description="Manual or imported best-effort references for quick performance tracking."
        eyebrow="Performance"
        title="Activity efforts"
      />

      <Card>
        <CardHeader>
          <CardTitle>{efforts.length} saved efforts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {efforts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center text-muted-foreground">
              Create an effort to track reference segments and best-power or best-speed efforts.
            </div>
          ) : (
            efforts.map((effort) => (
              <ActivityEffortListCard
                key={effort.id}
                effort={effort}
                onOpen={() =>
                  void navigate({
                    to: "/activity-efforts/$effortId",
                    params: { effortId: effort.id },
                  })
                }
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
