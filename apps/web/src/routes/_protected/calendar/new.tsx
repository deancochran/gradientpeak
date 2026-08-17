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

import {
  AgendaCreateForm,
  type AgendaCreateType,
} from "../../../components/planning/agenda-create-form";
import { getMonthKey, getTodayDateKey, isValidDateKey } from "../../../lib/planning";

export const Route = createFileRoute("/_protected/calendar/new")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { date?: string; type?: AgendaCreateType } => ({
    ...(typeof search.date === "string" && isValidDateKey(search.date)
      ? { date: search.date }
      : {}),
    ...(search.type === "planned" || search.type === "race_target" || search.type === "custom"
      ? { type: search.type }
      : {}),
  }),
  component: AgendaCreatePage,
});

function AgendaCreatePage() {
  const search = Route.useSearch() as { date?: string; type?: AgendaCreateType };

  return (
    <div className="space-y-6">
      <Button asChild variant="outline" size="sm">
        <Link to="/calendar" search={{ month: getMonthKey(new Date()), view: "month" }}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to calendar
        </Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>Create from agenda</CardTitle>
          <CardDescription>
            Schedule a personal planned session from a saved activity plan. Event and goal creation
            remain available as separate choices.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <AgendaCreateForm
            initialDate={search.date ?? getTodayDateKey()}
            initialType={search.type ?? "planned"}
          />
          <div className="border-t pt-4">
            <Button asChild variant="outline">
              <Link to="/goals/new" search={{ date: search.date ?? getTodayDateKey() }}>
                Create goal instead
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
