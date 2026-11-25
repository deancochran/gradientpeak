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

type Athlete = { profileId: string; displayName: string | null; username: string | null };
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
            Identity details are limited to the assignment directory. Data availability is checked
            after selection.
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
