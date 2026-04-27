import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, Check, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../../../lib/api/client";
import {
  formatScheduledTime,
  normalizeRecordingActivityCategory,
  recordingActivityOptions,
  validateRecordingSearch,
} from "../../../lib/recording-web";

export const Route = createFileRoute("/_protected/record/plan")({
  validateSearch: (search: Record<string, unknown>) => validateRecordingSearch(search),
  component: RecordPlanPage,
});

function RecordPlanPage() {
  const navigate = Route.useNavigate();
  const launcher = Route.useSearch();
  const [searchText, setSearchText] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | typeof launcher.category>("all");
  const { data: events = [], isLoading, error } = api.events.getToday.useQuery();

  const filteredEvents = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return events.filter((event) => {
      const plan = event.activity_plan;
      const category = normalizeRecordingActivityCategory(plan?.activity_category, "other");
      const matchesCategory = categoryFilter === "all" || category === categoryFilter;
      const matchesQuery =
        query.length === 0 ||
        plan?.name?.toLowerCase().includes(query) ||
        plan?.description?.toLowerCase().includes(query);

      return Boolean(plan) && matchesCategory && Boolean(matchesQuery);
    });
  }, [categoryFilter, events, searchText]);

  const attachPlan = (eventId: string) => {
    const event = events.find((candidate) => candidate.id === eventId);
    const category = normalizeRecordingActivityCategory(
      event?.activity_plan?.activity_category,
      launcher.category,
    );

    void navigate({
      to: "/record",
      search: {
        ...launcher,
        category,
        eventId,
        routeId: event?.activity_plan?.route_id ?? launcher.routeId ?? undefined,
      },
    });
  };

  const detachPlan = () => {
    void navigate({
      to: "/record",
      search: {
        ...launcher,
        eventId: undefined,
      },
    });
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Choose today&apos;s plan</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This mirrors the mobile plan picker with a browser-safe list of today&apos;s scheduled
            workouts.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/record" search={launcher}>
            Back to launcher
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
          <CardDescription>Search today&apos;s scheduled plans before you start.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Search today's plans"
            value={searchText}
            onChange={(event) => setSearchText(event.currentTarget.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant={categoryFilter === "all" ? "default" : "outline"}
              onClick={() => setCategoryFilter("all")}
            >
              All categories
            </Button>
            {recordingActivityOptions.map((option) => (
              <Button
                key={option.value}
                variant={categoryFilter === option.value ? "default" : "outline"}
                onClick={() => setCategoryFilter(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          {launcher.eventId ? (
            <Button variant="ghost" className="px-0 text-destructive" onClick={detachPlan}>
              Detach current plan
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-border bg-card">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : null}

      {!isLoading && error ? (
        <Card>
          <CardContent className="py-10 text-sm text-muted-foreground">
            Today&apos;s plans could not be loaded right now.
          </CardContent>
        </Card>
      ) : null}

      {!isLoading && !error && filteredEvents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <CalendarDays className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-medium text-foreground">No matching plans for today</p>
              <p className="text-sm text-muted-foreground">
                Adjust the search or come back after scheduling a workout in the planning flow.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4">
        {filteredEvents.map((event) => {
          const plan = event.activity_plan;
          if (!plan) {
            return null;
          }

          const isSelected = launcher.eventId === event.id;
          const category = normalizeRecordingActivityCategory(plan.activity_category, "other");

          return (
            <Card key={event.id} className={isSelected ? "border-primary" : undefined}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <CardTitle className="text-xl">{plan.name}</CardTitle>
                    <CardDescription>
                      {plan.description || "Planned workout ready to attach from today's calendar."}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{category}</Badge>
                    <Badge variant="outline">{formatScheduledTime(event.scheduled_date)}</Badge>
                    {plan.route_id ? <Badge>Includes route</Badge> : null}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {isSelected
                    ? "Attached to the launcher. Choosing it again keeps this workout selected."
                    : "Attach this workout to carry its category and linked route back to the launcher."}
                </p>
                <Button onClick={() => attachPlan(event.id)}>
                  {isSelected ? <Check className="mr-2 h-4 w-4" /> : null}
                  {isSelected ? "Attached" : "Attach plan"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
