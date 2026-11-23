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
    points: Array<{ date: string; dailyLoad: number }>;
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
  const latest = athlete.activities.points.at(-1);
  const first = athlete.activities.points[0];
  const change =
    latest && first && athlete.activities.points.length > 1
      ? latest.dailyLoad - first.dailyLoad
      : null;
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
        <dt className="font-medium text-foreground">28-day load</dt>
        <dd>
          {athlete.activities.status === "available" && latest
            ? `${latest.dailyLoad.toFixed(1)}${change === null ? "" : ` · ${change >= 0 ? "+" : ""}${change.toFixed(1)}`}`
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
    </dl>
  );
}
