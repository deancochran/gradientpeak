import { Badge } from "@repo/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { createFileRoute } from "@tanstack/react-router";
import { Calendar } from "lucide-react";

export const Route = createFileRoute("/_protected/calendar")({
  component: CalendarPage,
});

function CalendarPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-2xl">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          Calendar
        </CardTitle>
        <CardDescription>Calendar and scheduling hub scaffold for web parity.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          This route is the future home for calendar views, day agendas, and scheduled activity
          drill-ins.
        </p>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">Scheduled Activities</Badge>
          <Badge variant="outline">Day Agenda</Badge>
          <Badge variant="outline">Event Detail</Badge>
        </div>
      </CardContent>
    </Card>
  );
}
