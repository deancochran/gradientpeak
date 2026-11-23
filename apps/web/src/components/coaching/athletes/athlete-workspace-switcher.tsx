import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui/components/dialog";
import { SearchField } from "@repo/ui/components/search-field";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { loadAssignedCoachAthletes } from "../../../lib/coaching/athletes-server-functions";

type Athlete = { profileId: string; displayName: string | null; username: string | null };
type Page =
  | { status: "granted"; items: Athlete[]; nextCursor: string | null; hasMore: boolean }
  | { status: "forbidden" };
export function AthleteWorkspaceSwitcher(props: {
  organizationId: string;
  athleteId: string;
  selectedAthlete: Athlete | null;
  initialPage: Page;
}) {
  // Also protects callers that do not key the route's component themselves.
  return <Switcher key={`${props.organizationId}:${props.athleteId}`} {...props} />;
}
function Switcher({
  organizationId,
  athleteId,
  selectedAthlete,
  initialPage,
}: {
  organizationId: string;
  athleteId: string;
  selectedAthlete: Athlete | null;
  initialPage: Page;
}) {
  const load = useServerFn(loadAssignedCoachAthletes);
  const version = useRef(0);
  const alive = useRef(true);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(initialPage);
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      version.current++;
    };
  }, []);
  async function search(cursor: string | null, term: string) {
    const request = ++version.current;
    setLoading(true);
    setError(null);
    try {
      const next = await load({
        data: { organizationId, limit: 20, cursor, search: term || null },
      });
      if (alive.current && request === version.current) {
        setPage(next);
        setApplied(term);
      }
    } catch {
      if (alive.current && request === version.current)
        setError("Athletes could not be loaded. Retry the search.");
    } finally {
      if (alive.current && request === version.current) setLoading(false);
    }
  }
  return (
    <section className="rounded-xl border border-primary/30 bg-card/95 px-5 py-4 shadow-[0_0_0_1px_rgba(34,211,238,0.04)] sm:flex sm:items-end sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
          Selected athlete
        </p>
        <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {selectedAthlete?.displayName ?? selectedAthlete?.username ?? "Athlete unavailable"}
        </h1>
        {selectedAthlete?.username ? (
          <p className="text-sm text-muted-foreground">@{selectedAthlete.username}</p>
        ) : null}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="mt-4 border-border bg-card text-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring disabled:border-border disabled:bg-muted disabled:text-muted-foreground sm:mt-0"
          >
            Switch athlete ▾
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[85dvh] grid-cols-1 overflow-y-auto border-border bg-background text-foreground">
          <DialogHeader>
            <DialogTitle className="text-foreground">Switch athlete</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Search athletes assigned to you in this organization. Selection does not change their
              sharing permissions.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-w-0 gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void search(null, query.trim());
            }}
          >
            <SearchField
              accessibilityLabel="Search assigned athletes"
              className="min-w-0 flex-1"
              maxLength={120}
              onSubmit={() => void search(null, query.trim())}
              onValueChange={setQuery}
              placeholder="Search assigned athletes"
              value={query}
            />
            <Button
              type="submit"
              disabled={loading}
              className="border border-border bg-muted text-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
            >
              {error ? "Retry search" : "Search"}
            </Button>
          </form>
          {loading ? (
            <p role="status">Loading assigned athletes…</p>
          ) : error ? (
            <p role="alert">{error}</p>
          ) : page.status === "granted" ? (
            <>
              {page.items.length === 0 ? (
                <p>No assigned athletes match this search.</p>
              ) : (
                <ul aria-label="Switch athlete" className="max-h-64 overflow-auto">
                  {page.items.map((athlete) => (
                    <li key={athlete.profileId}>
                      <Link
                        to="/organizations/$organizationId/athletes/$athleteId"
                        params={{ organizationId, athleteId: athlete.profileId }}
                        onClick={() => setOpen(false)}
                        aria-current={athlete.profileId === athleteId ? "page" : undefined}
                        className="block rounded border border-transparent bg-card px-3 py-3 text-foreground hover:border-border hover:bg-muted hover:text-foreground focus-visible:border-primary focus-visible:bg-muted focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-[current=page]:border-primary aria-[current=page]:bg-muted aria-[current=page]:text-foreground"
                      >
                        {athlete.displayName ?? athlete.username ?? "Assigned athlete"}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void search(null, applied)}
                  className="border-border bg-card text-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
                >
                  First page
                </Button>
                {page.hasMore && page.nextCursor ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={query.trim() !== applied}
                    onClick={() => void search(page.nextCursor, applied)}
                    className="border-border bg-card text-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
                  >
                    Next page
                  </Button>
                ) : null}
              </div>
            </>
          ) : (
            <p>Your assigned-athlete directory is unavailable.</p>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
