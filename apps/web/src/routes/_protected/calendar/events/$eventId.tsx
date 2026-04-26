import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@repo/ui/components/alert-dialog";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";

import { api } from "../../../../lib/api/client";
import {
  formatDayLabel,
  formatEventTimeRange,
  getEventTitle,
  getEventTypeLabel,
  getMonthKey,
  getTodayDateKey,
} from "../../../../lib/planning";

const monthSearchPattern = /^\d{4}-\d{2}$/;

export const Route = createFileRoute("/_protected/calendar/events/$eventId")({
  validateSearch: (search: Record<string, unknown>) => ({
    month:
      typeof search.month === "string" && monthSearchPattern.test(search.month)
        ? search.month
        : getMonthKey(new Date()),
    view: search.view === "agenda" ? "agenda" : "month",
  }),
  component: EventDetailPage,
});

function EventDetailPage() {
  const navigate = Route.useNavigate();
  const utils = api.useUtils();
  const { eventId } = Route.useParams();
  const { month, view } = Route.useSearch();
  const eventQuery = api.events.getById.useQuery({ id: eventId }, { enabled: Boolean(eventId) });
  const event = eventQuery.data;
  const trainingPlanQuery = api.trainingPlans.getById.useQuery(
    { id: event?.training_plan_id ?? "00000000-0000-0000-0000-000000000000" },
    { enabled: Boolean(event?.training_plan_id) },
  );
  const deleteMutation = api.events.delete.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.events.invalidate(),
        utils.trainingPlans.getActivePlan.invalidate(),
      ]);
      void navigate({ to: "/calendar", search: { month, view } });
    },
  });

  if (eventQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading event...</p>;
  }

  if (!event) {
    return <p className="text-sm text-muted-foreground">Event not found.</p>;
  }

  const scheduledDate = event.scheduled_date ?? getTodayDateKey();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link
              to="/calendar/day/$date"
              params={{ date: scheduledDate }}
              search={{ month, view }}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to day
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{getEventTitle(event)}</h1>
            <p className="mt-1 text-muted-foreground">{formatDayLabel(scheduledDate)}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {event.event_type === "imported" ? null : (
            <Button asChild>
              <Link
                to="/calendar/events/$eventId/edit"
                params={{ eventId: event.id }}
                search={{ month, view }}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Edit event
              </Link>
            </Button>
          )}
          {event.event_type === "imported" ? null : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this event?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This first web slice deletes a single event instance only.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteMutation.mutate({ id: event.id, scope: "single" })}
                  >
                    Delete event
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Event details</CardTitle>
            <CardDescription>Schedule and planning context for this event.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{getEventTypeLabel(event.event_type)}</Badge>
              {event.status ? <Badge variant="secondary">{event.status}</Badge> : null}
              {event.activity_plan?.activity_category ? (
                <Badge>{event.activity_plan.activity_category}</Badge>
              ) : null}
            </div>
            <DetailRow
              label="When"
              value={`${formatDayLabel(scheduledDate)} · ${formatEventTimeRange(event)}`}
            />
            <DetailRow label="Activity plan" value={event.activity_plan?.name ?? "None attached"} />
            <DetailRow
              label="Generated from training plan"
              value={trainingPlanQuery.data?.name ?? "Not linked"}
            />
            <DetailRow label="Notes" value={event.notes?.trim() || "No notes yet."} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Context</CardTitle>
            <CardDescription>Useful planning metadata for the first web slice.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <DetailRow label="Scheduled date" value={scheduledDate} />
            <DetailRow label="All day" value={event.all_day ? "Yes" : "No"} />
            <DetailRow label="Training plan id" value={event.training_plan_id ?? "None"} />
            <DetailRow label="Event id" value={event.id} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm text-foreground">{value}</p>
    </div>
  );
}
