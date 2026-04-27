import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormSelectField,
  FormTextField,
} from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import { createFileRoute } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import {
  type ActivityEffortFormValues,
  activityEffortFormSchema,
  activityTypeOptions,
} from "../../../lib/activity-route-form-schemas";
import { api } from "../../../lib/api/client";

type ActivityEffortFormInput = z.input<typeof activityEffortFormSchema>;

function toDateTimeLocalValue(value: Date) {
  const offsetDate = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}

export const Route = createFileRoute("/_protected/activity-efforts/new")({
  component: ActivityEffortCreatePage,
});

function ActivityEffortCreatePage() {
  const navigate = Route.useNavigate();
  const utils = api.useUtils();
  const form = useForm<ActivityEffortFormInput, undefined, ActivityEffortFormValues>({
    defaultValues: {
      activity_category: "run",
      duration_seconds: 60,
      effort_type: "power",
      recorded_at: toDateTimeLocalValue(new Date()),
      unit: "W",
      value: 0,
    },
    resolver: zodResolver(activityEffortFormSchema),
  });
  const createMutation = api.activityEfforts.create.useMutation({
    onSuccess: async (effort) => {
      await utils.activityEfforts.invalidate();
      toast.success("Effort created");
      void navigate({ to: "/activity-efforts/$effortId", params: { effortId: effort.id } });
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
          <Form {...form}>
            <form
              className="space-y-4"
              onSubmit={form.handleSubmit(async (values) => {
                try {
                  await createMutation.mutateAsync({
                    activity_category: values.activity_category,
                    duration_seconds: values.duration_seconds,
                    effort_type: values.effort_type,
                    recorded_at: new Date(values.recorded_at).toISOString(),
                    unit: values.unit.trim(),
                    value: values.value,
                  });
                } catch (error) {
                  form.setError("root", {
                    message: error instanceof Error ? error.message : "Failed to create effort.",
                  });
                  toast.error("Effort creation failed");
                }
              })}
            >
              <FormSelectField
                control={form.control}
                label="Activity category"
                name="activity_category"
                options={activityTypeOptions.map((option) => ({ ...option }))}
                placeholder="Choose activity type"
              />
              <FormSelectField
                control={form.control}
                label="Effort type"
                name="effort_type"
                options={[
                  { label: "Power", value: "power" },
                  { label: "Speed", value: "speed" },
                ]}
                placeholder="Choose effort type"
              />
              <FormTextField
                control={form.control}
                label="Duration (seconds)"
                name="duration_seconds"
                type="number"
              />
              <FormTextField control={form.control} label="Value" name="value" type="number" />
              <FormTextField control={form.control} label="Unit" name="unit" />
              <FormField
                control={form.control}
                name="recorded_at"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Recorded at</FormLabel>
                    <Input {...field} type="datetime-local" />
                    <FormMessage />
                  </FormItem>
                )}
              />
              {form.formState.errors.root?.message ? (
                <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
              ) : null}
              <div className="flex flex-wrap justify-end gap-3">
                <Button
                  onClick={() => void navigate({ to: "/activity-efforts" })}
                  type="button"
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button disabled={createMutation.isPending} type="submit">
                  {createMutation.isPending ? "Saving effort..." : "Save effort"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
