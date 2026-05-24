import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { CalendarEventForm } from "../../../../../components/protected/calendar-event-form";
import { api } from "../../../../../lib/api/client";
import { getMonthKey, isValidMonthKey } from "../../../../../lib/planning";

export const Route = createFileRoute("/_protected/calendar/events/$eventId/edit")({
  validateSearch: (search: Record<string, unknown>) => ({
    month:
      typeof search.month === "string" && isValidMonthKey(search.month)
        ? search.month
        : getMonthKey(new Date()),
    view: search.view === "agenda" ? "agenda" : "month",
  }),
  component: EventEditPage,
});

function EventEditPage() {
  const { eventId } = Route.useParams();
  const { month, view } = Route.useSearch();
  const eventQuery = api.events.getById.useQuery({ id: eventId }, { enabled: Boolean(eventId) });
  const event = eventQuery.data;

  if (eventQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading event...</p>;
  }

  if (!event) {
    return <p className="text-sm text-muted-foreground">Event not found.</p>;
  }

  if (event.event_type === "imported") {
    return <p className="text-sm text-muted-foreground">Imported events are read-only.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="outline" size="sm">
          <Link
            to="/calendar/events/$eventId"
            params={{ eventId }}
            search={{ flash: undefined, flashType: undefined, month, view }}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to event
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Edit event</h1>
          <p className="mt-1 text-muted-foreground">
            Progressive single-event editing for the web calendar slice.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Update schedule</CardTitle>
          <CardDescription>This route updates one event instance at a time.</CardDescription>
        </CardHeader>
        <CardContent>
          <CalendarEventForm event={event} month={month} view={view as "agenda" | "month"} />
        </CardContent>
      </Card>
    </div>
  );
}
