import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { ActivityEffortForm } from "../../../components/protected/activity-effort-form";
import { api } from "../../../lib/api/client";

export const Route = createFileRoute("/_protected/activity-efforts/new")({
  component: ActivityEffortCreatePage,
});

function ActivityEffortCreatePage() {
  const navigate = Route.useNavigate();
  const utils = api.useUtils();
  const createMutation = api.activityEfforts.create.useMutation({
    onSuccess: async () => {
      await utils.activityEfforts.invalidate();
      toast.success("Effort created");
      void navigate({ to: "/activity-efforts" });
    },
  });

  return (
    <div className="container mx-auto max-w-3xl space-y-6 py-4">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Create activity effort</h1>
        <p className="text-sm text-muted-foreground">
          Save a best-effort reference for quick performance tracking when you do not need the full
          activity detail first.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Effort details</CardTitle>
        </CardHeader>
        <CardContent>
          <ActivityEffortForm
            onCancel={() => void navigate({ to: "/activity-efforts" })}
            onSubmit={(values) =>
              createMutation.mutateAsync({
                activity_category: values.activity_category,
                duration_seconds: values.duration_seconds,
                effort_type: values.effort_type,
                recorded_at: new Date(values.recorded_at).toISOString(),
                unit: values.unit.trim(),
                value: values.value,
              })
            }
            onSubmitError={() => {
              toast.error("Effort creation failed");
            }}
            pending={createMutation.isPending}
            submitLabel="Save effort"
            submittingLabel="Saving effort..."
          />
        </CardContent>
      </Card>
    </div>
  );
}
