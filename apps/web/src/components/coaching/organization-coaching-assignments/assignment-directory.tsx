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
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

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
  const searchInput = useRef<HTMLInputElement>(null);
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
    const formData = new FormData(event.currentTarget as HTMLFormElement);
    const nextPrimary = formData.get("primary") === "unassigned" ? "unassigned" : undefined;
    const nextStatus = formData.get("status");
    void navigate({
      to: "/organizations/$organizationId/assignments",
      params: { organizationId },
      search: {
        q: query.trim() || undefined,
        cursor: undefined,
        primary: nextPrimary,
        status: nextStatus === "active" || nextStatus === "paused" ? nextStatus : undefined,
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

  function focusAthleteSearch() {
    searchInput.current?.focus();
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
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-cyan-300">
            Administration
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-white">Coach assignments</h1>
          <p className="max-w-3xl text-sm leading-6 text-slate-400">
            Primary coaches and supporting responsibility. Temporary coverage and handovers are
            unavailable in this directory.
          </p>
        </div>
        <Button
          type="button"
          className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"
          onClick={focusAthleteSearch}
        >
          Find an athlete to assign
        </Button>
      </header>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.38fr)]">
        <Card className="@container min-w-0 border-slate-800 bg-slate-900 text-slate-50">
          <CardHeader>
            <CardTitle>Assignment directory</CardTitle>
            <CardDescription className="text-slate-400">
              {primary === "unassigned"
                ? "Showing athletes without a current primary coach. Supporting responsibility alone does not satisfy this filter."
                : "Choose an athlete to view or change their direct coaching responsibility."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={applySearch} className="flex flex-wrap gap-2">
              <div className="min-w-52 flex-1">
                <label className="sr-only" htmlFor="assignment-athlete-search">
                  Search athletes on this page
                </label>
                <input
                  ref={searchInput}
                  id="assignment-athlete-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search this loaded page by athlete name"
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                />
              </div>
              <label className="sr-only" htmlFor="assignment-primary-filter">
                Primary coach filter
              </label>
              <select
                id="assignment-primary-filter"
                name="primary"
                defaultValue={primary ?? "all"}
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              >
                <option value="all">All primary states</option>
                <option value="unassigned">Unassigned primary</option>
              </select>
              <label className="sr-only" htmlFor="assignment-status-filter">
                Athlete status filter
              </label>
              <select
                id="assignment-status-filter"
                name="status"
                defaultValue={status ?? "all"}
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              >
                <option value="all">All athlete states</option>
                <option value="active">Active athletes</option>
                <option value="paused">Paused athletes</option>
              </select>
              <Button type="submit" className="bg-cyan-400 text-slate-950 hover:bg-cyan-300">
                <Search className="mr-2 h-4 w-4" />
                Apply filters
              </Button>
            </form>
            {visibleAthletes.length === 0 ? (
              <p className="text-sm text-slate-400">No athletes on this page match this search.</p>
            ) : (
              <ul
                aria-label="Athlete coach assignments"
                className="divide-y divide-slate-700 border-y border-slate-700"
              >
                <li
                  aria-hidden="true"
                  className="hidden grid-cols-[minmax(10rem,1.2fr)_minmax(9rem,1fr)_minmax(9rem,1fr)_minmax(8rem,0.8fr)_9rem] gap-3 px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-400 @min-[54rem]:grid"
                >
                  <span>Athlete</span>
                  <span>Primary coach</span>
                  <span>Supporting coach</span>
                  <span>Coverage</span>
                  <span className="sr-only">Actions</span>
                </li>
                {visibleAthletes.map((athlete) => (
                  <li
                    key={athlete.engagementId}
                    className="grid gap-3 px-3 py-4 @min-[54rem]:grid-cols-[minmax(10rem,1.2fr)_minmax(9rem,1fr)_minmax(9rem,1fr)_minmax(8rem,0.8fr)_9rem] @min-[54rem]:items-center"
                  >
                    <div className="min-w-0 space-y-1 break-words">
                      <p className="font-medium">{identityName(athlete)}</p>
                      {athlete.identity.username ? (
                        <p className="text-sm text-slate-400">@{athlete.identity.username}</p>
                      ) : null}
                      {athlete.status === "paused" ? (
                        <Badge className="border-slate-700 bg-slate-800 text-slate-300">
                          Paused
                        </Badge>
                      ) : null}
                    </div>
                    <ResponsibilityColumn
                      label="Primary coach"
                      assignments={athlete.assignments.filter(
                        (assignment) => assignment.assignmentKind === "primary",
                      )}
                      empty="Unassigned"
                    />
                    <ResponsibilityColumn
                      label="Supporting coach"
                      assignments={athlete.assignments.filter(
                        (assignment) => assignment.assignmentKind === "supporting",
                      )}
                      empty="No supporting coach"
                    />
                    <div className="space-y-1 text-sm">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400 @min-[54rem]:sr-only">
                        Coverage
                      </p>
                      <Badge className="border-slate-700 bg-slate-800 text-slate-300">
                        Coverage unavailable
                      </Badge>
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
        <aside className="space-y-4" aria-label="Assignment scope and guidance">
          <Card className="border-slate-700 bg-slate-900 text-slate-50">
            <CardHeader>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                Organization scope
              </p>
              <CardTitle className="text-base">Authorized assignment directory</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-6 text-slate-400">
                This directory only shows athletes and eligible coaches within your authorized
                organization scope. It does not grant billing, consent, or private training access.
              </p>
            </CardContent>
          </Card>
          <Card className="border-slate-700 bg-slate-900 text-slate-50">
            <CardHeader>
              <CardTitle className="text-base">Next useful action</CardTitle>
              <CardDescription className="text-slate-400">
                Find the athlete whose primary responsibility needs review, then manage coaches from
                their row.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                type="button"
                variant="outline"
                className="border-slate-600 bg-slate-900 text-slate-100 hover:bg-slate-800 hover:text-white"
                onClick={focusAthleteSearch}
              >
                Find an athlete to assign
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function ResponsibilityColumn({
  label,
  assignments,
  empty,
}: {
  label: string;
  assignments: Assignment[];
  empty: string;
}) {
  return (
    <div className="min-w-0 space-y-1 break-words text-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400 @min-[54rem]:sr-only">
        {label}
      </p>
      {assignments.length ? (
        assignments.map((assignment) => (
          <Fragment key={assignment.assignmentId}>
            <p>{assignment.coachName}</p>
            {assignment.coachMembershipStatus !== "active" ? (
              <Badge className="border-amber-800 bg-amber-950 capitalize text-amber-200">
                Coach {assignment.coachMembershipStatus}
              </Badge>
            ) : null}
          </Fragment>
        ))
      ) : (
        <Badge className="border-amber-800 bg-amber-950 text-amber-200">{empty}</Badge>
      )}
    </div>
  );
}

function identityName(athlete: Athlete) {
  return athlete.identity.displayName ?? athlete.identity.username ?? "Organization athlete";
}
