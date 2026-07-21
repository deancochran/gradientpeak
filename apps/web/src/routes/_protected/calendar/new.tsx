import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import {
  AgendaCreateForm,
  type AgendaCreateType,
} from "../../../components/planning/agenda-create-form";
import { getTodayDateKey, isValidDateKey } from "../../../lib/planning";

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
        <a href="/calendar">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to calendar
        </a>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>Create from agenda</CardTitle>
          <CardDescription>
            Create a custom event, race, recurring series, planned activity, or continue to a goal.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <AgendaCreateForm
            initialDate={search.date ?? getTodayDateKey()}
            initialType={search.type ?? "custom"}
          />
          <div className="border-t pt-4">
            <Button asChild variant="outline">
              <a href={`/goals/new?date=${search.date ?? getTodayDateKey()}`}>
                Create goal instead
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
