import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Link, useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
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
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-cyan-300">Coaching</p>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Assigned athletes</h1>
        <p className="max-w-3xl text-sm leading-6 text-slate-400">
          Only athletes assigned directly to you or through one of your groups appear here.
          Selecting an athlete does not grant access to private data.
        </p>
      </header>
      <form onSubmit={applySearch} className="flex max-w-xl gap-2">
        <label className="sr-only" htmlFor="athlete-search">
          Search assigned athletes
        </label>
        <input
          id="athlete-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name or username"
          className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500"
        />
        <Button type="submit">
          <Search className="mr-2 h-4 w-4" />
          Search
        </Button>
      </form>
      <Card className="border-slate-800 bg-slate-900 text-slate-50">
        <CardHeader>
          <CardTitle>Athlete directory</CardTitle>
          <CardDescription className="text-slate-400">
            Identity details are limited to the assignment directory. Data availability is checked
            after selection.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {page.items.length === 0 ? (
            <p className="text-sm text-slate-400">No assigned athletes match this search.</p>
          ) : (
            <ul aria-label="Assigned athletes" className="space-y-2">
              {page.items.map((athlete) => (
                <li key={athlete.profileId}>
                  <Link
                    to="/organizations/$organizationId/athletes/$athleteId"
                    params={{ organizationId, athleteId: athlete.profileId }}
                    className="block rounded-md border border-slate-800 px-4 py-3 hover:border-cyan-700 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-cyan-300"
                  >
                    <span className="block font-medium">
                      {athlete.displayName ?? athlete.username ?? "Assigned athlete"}
                    </span>
                    {athlete.username ? (
                      <span className="text-sm text-slate-400">@{athlete.username}</span>
                    ) : null}
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
                className="text-sm text-cyan-300 hover:text-cyan-100"
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
