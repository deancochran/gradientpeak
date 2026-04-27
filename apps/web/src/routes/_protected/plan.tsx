import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, Flag, Target } from "lucide-react";
import { useMemo, useState } from "react";

import { RouteFlashToast, type RouteFlashType } from "../../components/route-flash-toast";
import { api } from "../../lib/api/client";
import { formatShortDayLabel, getTodayDateKey, type PlanningEvent } from "../../lib/planning";
import { createPlanGoalAction } from "../../lib/planning/server-actions";

export const Route = createFileRoute("/_protected/plan")({
  validateSearch: (search: Record<string, unknown>) => ({
    flash: typeof search.flash === "string" ? search.flash : undefined,
    flashType:
      search.flashType === "success" || search.flashType === "error" || search.flashType === "info"
        ? (search.flashType as RouteFlashType)
        : undefined,
  }),
  component: PlanPage,
});

function PlanPage() {
  const navigate = Route.useNavigate();
  const { flash, flashType } = Route.useSearch();
  const [goalTitle, setGoalTitle] = useState("");
  const [goalDate, setGoalDate] = useState(getTodayDateKey());
  const [goalPriority, setGoalPriority] = useState("5");
  const [goalActivityCategory, setGoalActivityCategory] = useState("run");
  const [goalSessionsPerWeek, setGoalSessionsPerWeek] = useState("4");
  const [goalWeeks, setGoalWeeks] = useState("8");

  const profileQuery = api.profiles.get.useQuery();
  const activePlanQuery = api.trainingPlans.getActivePlan.useQuery();
  const trainingPlansQuery = api.trainingPlans.list.useQuery({
    includeOwnOnly: true,
    includeSystemTemplates: false,
    limit: 6,
  });

  const upcomingEventsQuery = api.events.list.useQuery({
    date_from: getTodayDateKey(),
    date_to: "2100-12-31",
    include_adhoc: false,
    limit: 12,
  });
  const goalsQuery = api.goals.list.useQuery(
    {
      profile_id: profileQuery.data?.id ?? "00000000-0000-0000-0000-000000000000",
      limit: 200,
    },
    { enabled: Boolean(profileQuery.data?.id) },
  );

  const upcomingEvents = useMemo(
    () => (upcomingEventsQuery.data?.items ?? []) as PlanningEvent[],
    [upcomingEventsQuery.data?.items],
  );
  const nextGoal = useMemo(() => {
    const goals = [...(goalsQuery.data?.items ?? [])];
    return goals.sort((a, b) => a.target_date.localeCompare(b.target_date))[0] ?? null;
  }, [goalsQuery.data?.items]);

  return (
    <div className="space-y-6">
      <RouteFlashToast
        message={flash}
        type={flashType}
        clear={() =>
          void navigate({
            to: "/plan",
            search: { flash: undefined, flashType: undefined },
            replace: true,
          })
        }
      />
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
          <Target className="h-6 w-6 text-muted-foreground" />
          Plan
        </h1>
        <p className="mt-2 text-muted-foreground">
          Active training context, goal anchors, and upcoming scheduled work.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Active plan</CardTitle>
            <CardDescription>The current schedule batch driving upcoming sessions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {activePlanQuery.data ? (
              <>
                <div>
                  <p className="text-xl font-semibold">
                    {activePlanQuery.data.training_plan?.name ?? "Untitled plan"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {activePlanQuery.data.training_plan?.description?.trim() ||
                      "No plan description yet."}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{activePlanQuery.data.status}</Badge>
                  {activePlanQuery.data.next_event_at ? (
                    <Badge variant="outline">
                      Next event {new Date(activePlanQuery.data.next_event_at).toLocaleDateString()}
                    </Badge>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No active plan detected from future scheduled events.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Next goal anchor</CardTitle>
            <CardDescription>The nearest target visible in planning.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {nextGoal ? (
              <>
                <div className="rounded-xl border p-4">
                  <p className="font-medium">{nextGoal.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatShortDayLabel(nextGoal.target_date)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge>{nextGoal.activity_category}</Badge>
                  <Badge variant="outline">Priority {nextGoal.priority}/10</Badge>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No goals created yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              Upcoming scheduled work
            </CardTitle>
            <CardDescription>
              Real upcoming planned events from existing scheduling queries.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {upcomingEventsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading scheduled work...</p>
            ) : upcomingEvents.length > 0 ? (
              <div className="space-y-3">
                {upcomingEvents.slice(0, 8).map((event) => (
                  <div key={event.id} className="rounded-xl border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">
                          {event.title ?? event.activity_plan?.name ?? "Untitled event"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatShortDayLabel(event.scheduled_date ?? getTodayDateKey())}
                        </p>
                      </div>
                      <Badge variant="outline">
                        {event.activity_plan?.activity_category ?? event.event_type ?? "event"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No upcoming scheduled events yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Flag className="h-4 w-4 text-muted-foreground" />
                  Goals
                </CardTitle>
                <CardDescription>Quick-create consistency goals from web planning.</CardDescription>
              </div>
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="sm">New goal</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create goal</DialogTitle>
                    <DialogDescription>
                      This first slice creates consistency-style goals directly from the plan page.
                    </DialogDescription>
                  </DialogHeader>
                  <form action={createPlanGoalAction.url} method="post" className="space-y-4">
                    <input type="hidden" name="profile_id" value={profileQuery.data?.id ?? ""} />
                    <input type="hidden" name="redirectTo" value="/plan" />
                    <div className="space-y-2">
                      <Label htmlFor="goal-title">Title</Label>
                      <Input
                        id="goal-title"
                        name="title"
                        value={goalTitle}
                        onChange={(event) => setGoalTitle(event.target.value)}
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="goal-date">Target date</Label>
                        <Input
                          id="goal-date"
                          name="target_date"
                          type="date"
                          value={goalDate}
                          onChange={(event) => setGoalDate(event.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="goal-activity">Activity</Label>
                        <select
                          id="goal-activity"
                          name="activity_category"
                          value={goalActivityCategory}
                          onChange={(event) => setGoalActivityCategory(event.target.value)}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                          <option value="run">Run</option>
                          <option value="bike">Bike</option>
                          <option value="swim">Swim</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-2">
                        <Label htmlFor="goal-priority">Priority</Label>
                        <Input
                          id="goal-priority"
                          name="priority"
                          type="number"
                          min="0"
                          max="10"
                          value={goalPriority}
                          onChange={(event) => setGoalPriority(event.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="goal-sessions">Sessions / week</Label>
                        <Input
                          id="goal-sessions"
                          name="target_sessions_per_week"
                          type="number"
                          min="1"
                          value={goalSessionsPerWeek}
                          onChange={(event) => setGoalSessionsPerWeek(event.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="goal-weeks">Weeks</Label>
                        <Input
                          id="goal-weeks"
                          name="target_weeks"
                          type="number"
                          min="1"
                          value={goalWeeks}
                          onChange={(event) => setGoalWeeks(event.target.value)}
                        />
                      </div>
                    </div>
                    <Button type="submit" disabled={!profileQuery.data?.id || !goalTitle.trim()}>
                      Create goal
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {goalsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading goals...</p>
            ) : goalsQuery.data?.items?.length ? (
              <div className="space-y-3">
                {goalsQuery.data.items.map((goal) => (
                  <div key={goal.id} className="rounded-xl border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{goal.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatShortDayLabel(goal.target_date)}
                        </p>
                      </div>
                      <Badge variant="outline">{goal.priority}/10</Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge>{goal.activity_category}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No goals yet. Add one to anchor your plan.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Available training plans</CardTitle>
          <CardDescription>Your current plan library on web.</CardDescription>
        </CardHeader>
        <CardContent>
          {trainingPlansQuery.data?.items?.length ? (
            <div className="flex flex-wrap gap-2">
              {trainingPlansQuery.data.items.map((plan) => (
                <Badge key={plan.id} variant="outline">
                  {plan.name}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No saved training plans yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
