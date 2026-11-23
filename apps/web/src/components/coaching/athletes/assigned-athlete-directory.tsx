import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { IdentitySummary } from "@repo/ui/components/identity-summary";
import { SearchField } from "@repo/ui/components/search-field";
import {
  TrainingStateChart,
  type TrainingStateVisualContract,
} from "@repo/ui/components/training-state-chart";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

type Athlete = {
  profileId: string;
  displayName: string | null;
  username: string | null;
  metrics?: {
    status: "available" | "unavailable" | "unshared";
    freshness?: "fresh" | "stale" | "unavailable";
  };
  activities?: {
    status: "available" | "unavailable" | "unshared";
    planningTimezone: string | null;
    rangeStartDate: string | null;
    rangeEndDate: string | null;
    qualifier?: "fresh" | "stale" | "partial" | "unavailable";
    points: Array<{
      date: string;
      dailyLoad: number;
      fitness: number;
      fatigue: number;
      form: number;
      coverageStatus: "complete" | "partial";
      omittedActivityCount: number;
    }>;
  };
  goals?: {
    status: "available" | "unavailable" | "unshared";
    items: Array<{
      id: string;
      name: string;
      targetDate: string;
      category: string;
      priority: number;
    }>;
  };
};
type Page = { items: Athlete[]; nextCursor: string | null; hasMore: boolean };

export function AssignedAthleteDirectory({
  organizationId,
  page,
  search,
}: {
  organizationId: string;
  page: Page;
  search: string | null;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState(search ?? "");
  useEffect(() => setQuery(search ?? ""), [search]);
  const applySearch = (event: React.FormEvent) => {
    event.preventDefault();
    void navigate({
      to: "/organizations/$organizationId/athletes",
      params: { organizationId },
      search: { q: query.trim() || undefined, cursor: undefined },
    });
  };
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">Coaching</p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Assigned athletes</h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Only athletes assigned directly to you or through one of your groups appear here.
          Selecting an athlete does not grant access to private data.
        </p>
      </header>
      <form onSubmit={applySearch} className="flex max-w-xl gap-2">
        <SearchField
          accessibilityLabel="Search assigned athletes"
          className="flex-1"
          maxLength={100}
          name="athlete-search"
          value={query}
          onValueChange={setQuery}
          placeholder="Search name or username"
          testId="athlete-search"
        />
        <Button type="submit">Search</Button>
      </form>
      <Card>
        <CardHeader>
          <CardTitle>Athlete directory</CardTitle>
          <CardDescription>
            Shared training facts are shown only for the scope each athlete has authorized.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {page.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No assigned athletes match this search.</p>
          ) : (
            <ul aria-label="Assigned athletes" className="space-y-2">
              {page.items.map((athlete) => (
                <li key={athlete.profileId}>
                  <Link
                    to="/organizations/$organizationId/athletes/$athleteId"
                    params={{ organizationId, athleteId: athlete.profileId }}
                    className="block rounded-md border border-border px-4 py-3 hover:border-primary hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <IdentitySummary
                      supporting={athlete.username ? `@${athlete.username}` : undefined}
                      title={athlete.displayName ?? athlete.username ?? "Assigned athlete"}
                    />
                    <VisualFacts athlete={athlete} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {page.hasMore && page.nextCursor ? (
            <div className="mt-4">
              <Link
                to="/organizations/$organizationId/athletes"
                params={{ organizationId }}
                search={{ q: search ?? undefined, cursor: page.nextCursor }}
                className="text-sm text-primary underline-offset-4 hover:underline"
              >
                Next page of athletes
              </Link>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function VisualFacts({ athlete }: { athlete: Athlete }) {
  if (!athlete.metrics || !athlete.activities || !athlete.goals) return null;
  const goal = athlete.goals.items[0];
  return (
    <dl className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
      <div>
        <dt className="font-medium text-foreground">Training state</dt>
        <dd>
          {athlete.metrics.status === "available"
            ? athlete.metrics.freshness === "stale"
              ? "Stale"
              : "Fresh"
            : athlete.metrics.status === "unshared"
              ? "Unshared"
              : "Unavailable"}
        </dd>
      </div>
      <div>
        <dt className="font-medium text-foreground">28-day training state</dt>
        <dd>
          {athlete.activities.status === "available"
            ? `${athlete.activities.points.length} recorded days · ${athlete.activities.qualifier ?? "unavailable"}`
            : athlete.activities.status === "unshared"
              ? "Unshared"
              : "Unavailable"}
        </dd>
      </div>
      <div>
        <dt className="font-medium text-foreground">Next goal</dt>
        <dd>
          {athlete.goals.status === "available" && goal
            ? `${goal.name} · ${goal.targetDate}`
            : athlete.goals.status === "unshared"
              ? "Unshared"
              : "Unavailable"}
        </dd>
      </div>
      {athlete.activities.status === "available" && athlete.activities.planningTimezone ? (
        <div className="sm:col-span-3">
          <RosterTrainingStateChart
            points={athlete.activities.points}
            rangeEndDate={athlete.activities.rangeEndDate}
            rangeStartDate={athlete.activities.rangeStartDate}
            timeZone={athlete.activities.planningTimezone}
          />
        </div>
      ) : null}
    </dl>
  );
}

function RosterTrainingStateChart({
  points,
  rangeEndDate,
  rangeStartDate,
  timeZone,
}: {
  points: NonNullable<Athlete["activities"]>["points"];
  rangeEndDate: string | null;
  rangeStartDate: string | null;
  timeZone: string;
}) {
  const byDate = new Map(points.map((point) => [point.date, point]));
  const dates =
    rangeStartDate && rangeEndDate
      ? calendarDatesInclusive(rangeStartDate, rangeEndDate)
      : points.map((point) => point.date);
  const visual: TrainingStateVisualContract = {
    points: dates.map((date, index) => ({
      date,
      index,
      projected: { fatigue: null, fitness: null, form: null },
      recorded: (() => {
        const point = byDate.get(date);
        return point
          ? { fatigue: point.fatigue, fitness: point.fitness, form: point.form }
          : { fatigue: null, fitness: null, form: null };
      })(),
    })),
    sourceStatus: "recorded",
    timeZone,
    unitLabel: "Common Load points",
  };
  return (
    <TrainingStateChart
      description={`Recorded training state for ${rangeStartDate ?? "the available"} through ${rangeEndDate ?? "the available"} planning dates (${timeZone}). Missing dates are shown as gaps; no values are inferred.`}
      emptyMessage="No complete daily load observations are available."
      series={[
        { metric: "fitness", source: "recorded" },
        { metric: "fatigue", source: "recorded" },
        { metric: "form", source: "recorded" },
      ]}
      title="Recent training state"
      visual={visual}
    />
  );
}

function calendarDatesInclusive(start: string, end: string) {
  const dates: string[] = [];
  for (
    let current = new Date(`${start}T00:00:00Z`);
    current <= new Date(`${end}T00:00:00Z`);
    current.setUTCDate(current.getUTCDate() + 1)
  )
    dates.push(current.toISOString().slice(0, 10));
  return dates;
}
