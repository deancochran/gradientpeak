import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui/components/dialog";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useId, useRef, useState } from "react";
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
  const inputId = useId();
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
    <section className="rounded-lg border border-cyan-900 bg-slate-900 p-4">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-300">
        Selected athlete
      </p>
      <h1 className="mt-1 text-2xl font-semibold text-white">
        {selectedAthlete?.displayName ?? selectedAthlete?.username ?? "Athlete unavailable"}
      </h1>
      {selectedAthlete?.username ? (
        <p className="text-sm text-slate-400">@{selectedAthlete.username}</p>
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="mt-3 border-slate-600 bg-slate-900 text-slate-100 hover:bg-slate-800 hover:text-white focus-visible:ring-cyan-300 disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
          >
            Switch athlete ▾
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[85dvh] grid-cols-1 overflow-y-auto border-slate-700 bg-slate-950 text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-white">Switch athlete</DialogTitle>
            <DialogDescription className="text-slate-300">
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
            <label className="sr-only" htmlFor={inputId}>
              Search assigned athletes
            </label>
            <input
              id={inputId}
              value={query}
              maxLength={120}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1 rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-400 focus-visible:border-cyan-300 focus-visible:ring-2 focus-visible:ring-cyan-300"
            />
            <Button
              type="submit"
              disabled={loading}
              className="border border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700 hover:text-white focus-visible:ring-cyan-300 disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
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
                        className="block rounded border border-transparent bg-slate-900 px-3 py-3 text-slate-100 hover:border-slate-600 hover:bg-slate-800 hover:text-white focus-visible:border-cyan-300 focus-visible:bg-slate-800 focus-visible:text-white focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 aria-[current=page]:border-cyan-500 aria-[current=page]:bg-slate-800 aria-[current=page]:text-white"
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
                  className="border-slate-600 bg-slate-900 text-slate-100 hover:bg-slate-800 hover:text-white focus-visible:ring-cyan-300 disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
                >
                  First page
                </Button>
                {page.hasMore && page.nextCursor ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={query.trim() !== applied}
                    onClick={() => void search(page.nextCursor, applied)}
                    className="border-slate-600 bg-slate-900 text-slate-100 hover:bg-slate-800 hover:text-white focus-visible:ring-cyan-300 disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
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
