import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";

import { OrganizationCoachingAssignments } from "./organization-coaching-assignments";

type Assignment = {
  assignmentId: string;
  assignmentKind: "primary" | "supporting";
  coachName: string;
  coachMembershipStatus: "active" | "suspended" | "ended";
};
type Athlete = {
  engagementId: string;
  identity: { displayName: string | null; username: string | null };
  status: "active" | "paused";
  assignments: Assignment[];
};
type Page = { items: Athlete[]; nextCursor: string | null; hasMore: boolean };

export function AssignmentDirectory({
  actorProfileId,
  organizationId,
  page,
  search,
  primary = null,
  status = null,
}: {
  actorProfileId: string;
  organizationId: string;
  page: Page;
  search: string | null;
  primary?: "unassigned" | null;
  status?: "active" | "paused" | null;
}) {
  const navigate = useNavigate();
  const router = useRouter();
  const [query, setQuery] = useState(search ?? "");
  const [selected, setSelected] = useState<Athlete | null>(null);
  const [accessLost, setAccessLost] = useState(false);
  const [refreshState, setRefreshState] = useState<"idle" | "loading" | "error">("idle");
  useEffect(() => setQuery(search ?? ""), [search]);

  const visibleAthletes = useMemo(() => {
    const normalized = (search ?? "").toLocaleLowerCase();
    if (!normalized) return page.items;
    return page.items.filter((athlete) =>
      identityName(athlete).toLocaleLowerCase().includes(normalized),
    );
  }, [page.items, search]);

  function applySearch(event: React.FormEvent) {
    event.preventDefault();
    void navigate({
      to: "/organizations/$organizationId/assignments",
      params: { organizationId },
      search: {
        q: query.trim() || undefined,
        cursor: undefined,
        primary: primary ?? undefined,
        status: status ?? undefined,
      },
    });
  }

  async function refreshDirectory() {
    setSelected(null);
    setRefreshState("loading");
    try {
      await router.invalidate({ sync: true });
      setRefreshState("idle");
    } catch {
      setRefreshState("error");
    }
  }

  if (accessLost)
    return (
      <p role="alert" className="text-sm text-red-300">
        Your assignment-management access changed. Athlete and assignment details are no longer
        shown.
      </p>
    );

  if (refreshState === "loading") return <p role="status">Refreshing coach assignments…</p>;
  if (refreshState === "error")
    return (
      <div role="alert">
        <p>Current assignments could not be refreshed. Previous assignment details are hidden.</p>
        <Button onClick={() => void refreshDirectory()}>Retry assignment refresh</Button>
      </div>
    );
  if (selected)
    return (
      <OrganizationCoachingAssignments
        athleteName={identityName(selected)}
        actorProfileId={actorProfileId}
        engagementId={selected.engagementId}
        onAccessLost={() => setAccessLost(true)}
        onClose={() => void refreshDirectory()}
        organizationId={organizationId}
      />
    );

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-cyan-300">
          Administration
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Coach assignments</h1>
        <p className="max-w-3xl text-sm leading-6 text-slate-400">
          Direct coach responsibility is separate from membership, billing, athlete consent, and
          private training access. Temporary coverage and handovers are not available yet.
        </p>
      </header>
      <form onSubmit={applySearch} className="flex max-w-xl gap-2">
        <label className="sr-only" htmlFor="assignment-athlete-search">
          Search athletes on this page
        </label>
        <input
          id="assignment-athlete-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search this loaded page by athlete name"
          className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500"
        />
        <Button type="submit" className="bg-cyan-400 text-slate-950 hover:bg-cyan-300">
          <Search className="mr-2 h-4 w-4" />
          Search
        </Button>
      </form>
      <Card className="border-slate-800 bg-slate-900 text-slate-50">
        <CardHeader>
          <CardTitle>Direct assignment directory</CardTitle>
          <CardDescription className="text-slate-400">
            {primary === "unassigned"
              ? "Showing athletes without a current primary coach. Supporting responsibility alone does not satisfy this filter."
              : "Current primary and supporting responsibilities are listed below; unassigned athletes have no direct coach responsibility."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {visibleAthletes.length === 0 ? (
            <p className="text-sm text-slate-400">No athletes on this page match this search.</p>
          ) : (
            <ul aria-label="Athlete coach assignments" className="space-y-3">
              {visibleAthletes.map((athlete) => (
                <li
                  key={athlete.engagementId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-800 p-4"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium">{identityName(athlete)}</p>
                    {athlete.identity.username ? (
                      <p className="text-sm text-slate-400">@{athlete.identity.username}</p>
                    ) : null}
                    <fieldset className="flex flex-wrap gap-2">
                      <legend className="sr-only">
                        Responsibilities for {identityName(athlete)}
                      </legend>
                      {athlete.assignments.length ? (
                        athlete.assignments.map((assignment) => (
                          <Fragment key={assignment.assignmentId}>
                            <Badge className="border-slate-700 bg-slate-800 text-slate-200">
                              {assignment.assignmentKind === "primary" ? "Primary" : "Supporting"}:{" "}
                              {assignment.coachName}
                            </Badge>
                            {assignment.coachMembershipStatus !== "active" ? (
                              <Badge className="border-amber-800 bg-amber-950 capitalize text-amber-200">
                                Coach {assignment.coachMembershipStatus}
                              </Badge>
                            ) : null}
                          </Fragment>
                        ))
                      ) : (
                        <Badge className="border-amber-800 bg-amber-950 text-amber-200">
                          Unassigned
                        </Badge>
                      )}
                      {athlete.status === "paused" ? (
                        <Badge className="border-slate-700 bg-slate-800 text-slate-300">
                          Paused
                        </Badge>
                      ) : null}
                    </fieldset>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-slate-600 bg-slate-900 text-slate-100 hover:bg-slate-800 hover:text-white"
                    onClick={() => setSelected(athlete)}
                  >
                    Manage coaches
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {page.hasMore && page.nextCursor ? (
            <Link
              to="/organizations/$organizationId/assignments"
              params={{ organizationId }}
              search={{
                q: search ?? undefined,
                cursor: page.nextCursor,
                primary: primary ?? undefined,
                status: status ?? undefined,
              }}
              className="inline-block text-sm text-cyan-300 hover:text-cyan-100"
            >
              Next page of athletes
            </Link>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function identityName(athlete: Athlete) {
  return athlete.identity.displayName ?? athlete.identity.username ?? "Organization athlete";
}
