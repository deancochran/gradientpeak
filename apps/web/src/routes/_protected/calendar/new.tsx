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

import { AgendaCreateForm } from "../../../components/planning/agenda-create-form";
import {
  getMonthKey,
  getTodayDateKey,
  isValidDateKey,
  isValidMonthKey,
} from "../../../lib/planning";

export const Route = createFileRoute("/_protected/calendar/new")({
  validateSearch: (search: Record<string, unknown>) => ({
    ...(typeof search.date === "string" && isValidDateKey(search.date)
      ? { date: search.date }
      : {}),
    month:
      typeof search.month === "string" && isValidMonthKey(search.month)
        ? search.month
        : getMonthKey(new Date()),
    view: search.view === "agenda" || search.view === "week" ? search.view : "month",
  }),
  component: AgendaCreatePage,
});

function AgendaCreatePage() {
  const { date, month, view } = Route.useSearch();
  const selectedDate = date ?? getTodayDateKey();
  const calendarView = view === "agenda" || view === "week" ? view : "month";
  const calendarSearch: { date: string; month: string; view: "agenda" | "month" | "week" } = {
    date: selectedDate,
    month,
    view: calendarView,
  };
  const returnTo = `/calendar?${new URLSearchParams(calendarSearch).toString()}`;

  return (
    <div className="space-y-6">
      <Button asChild variant="outline" size="sm">
        <Link to="/calendar" search={calendarSearch}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to calendar
        </Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>Create event</CardTitle>
          <CardDescription>Create an event for this day, or add a goal instead.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <AgendaCreateForm initialDate={selectedDate} redirectTo={returnTo} />
          <div className="border-t pt-4">
            <Button asChild variant="outline">
              <Link to="/goals/new" search={{ date: selectedDate }}>
                Create goal instead
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
