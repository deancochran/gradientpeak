import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { useServerFn } from "@tanstack/react-start";
import { type ComponentProps, useEffect, useRef, useState } from "react";
import { loadCoachAthleteGoals } from "../../../lib/coaching/athlete-goals-server-functions";

type Goal = {
  id: string;
  name: string;
  targetDate: string;
  category: string;
  priority: number;
  status: string;
};
type Granted = { status: "granted"; items: ReadonlyArray<Goal>; nextCursor: string | null };
type Result = Granted | { status: "forbidden" } | { status: "error" };

function requestKey(
  actorProfileId: string,
  organizationId: string,
  athleteId: string,
  revision: string,
) {
  return `${actorProfileId}:${organizationId}:${athleteId}:${revision}`;
}

function mergeGoals(current: ReadonlyArray<Goal>, next: ReadonlyArray<Goal>) {
  const goals = new Map(current.map((goal) => [goal.id, goal]));
  for (const goal of next) goals.set(goal.id, goal);
  return [...goals.values()];
}

/** Read-only consented goal summaries; lifecycle labels do not assess achievement or readiness. */
export function CoachAthleteGoals({
  actorProfileId,
  athleteId,
  loaderRevision,
  organizationId,
  result: initialResult,
}: {
  actorProfileId: string;
  athleteId: string;
  loaderRevision: string;
  organizationId: string;
  result: Result;
}) {
  const load = useServerFn(loadCoachAthleteGoals);
  const source = requestKey(actorProfileId, organizationId, athleteId, loaderRevision);
  const fence = useRef({ request: 0, lifetime: 0, source, snapshot: initialResult });
  const pending = useRef(false);
  const denied = useRef(initialResult.status === "forbidden");
  const alive = useRef(true);
  let snapshotChanged = false;
  if (fence.current.source !== source || fence.current.snapshot !== initialResult) {
    fence.current = {
      request: 0,
      lifetime: fence.current.lifetime + 1,
      source,
      snapshot: initialResult,
    };
    snapshotChanged = true;
    pending.current = false;
    denied.current = initialResult.status === "forbidden";
  }
  const [result, setResult] = useState<Result>(initialResult);
  const [loadedLifetime, setLoadedLifetime] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [failedCursor, setFailedCursor] = useState<string | null | undefined>();

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      pending.current = false;
      fence.current.request += 1;
    };
  }, []);

  useEffect(() => {
    if (fence.current.source !== source || fence.current.snapshot !== initialResult) return;
    setResult(initialResult);
    setLoadedLifetime(fence.current.lifetime);
    setIsLoading(false);
    setFailedCursor(undefined);
  }, [initialResult, source]);

  const request = async (cursor: string | null, append: boolean) => {
    if (!alive.current || pending.current || denied.current) return;
    pending.current = true;
    const active = { lifetime: fence.current.lifetime, request: fence.current.request + 1, source };
    fence.current.request = active.request;
    setIsLoading(true);
    setFailedCursor(undefined);
    try {
      const next = await load({ data: { athleteProfileId: athleteId, cursor, organizationId } });
      if (
        !alive.current ||
        fence.current.lifetime !== active.lifetime ||
        fence.current.request !== active.request ||
        fence.current.source !== active.source
      )
        return;
      if (next.status === "forbidden") {
        denied.current = true;
        setResult(next);
        return;
      }
      setResult(
        append && result.status === "granted"
          ? { ...next, items: mergeGoals(result.items, next.items) }
          : next,
      );
    } catch {
      if (
        !alive.current ||
        fence.current.lifetime !== active.lifetime ||
        fence.current.request !== active.request ||
        fence.current.source !== active.source
      )
        return;
      setFailedCursor(cursor);
    } finally {
      if (
        alive.current &&
        fence.current.lifetime === active.lifetime &&
        fence.current.request === active.request &&
        fence.current.source === active.source
      ) {
        pending.current = false;
        setIsLoading(false);
      }
    }
  };

  const displayed = snapshotChanged ? initialResult : result;
  const loading = snapshotChanged ? false : isLoading;
  if (!snapshotChanged && loadedLifetime !== fence.current.lifetime)
    return <p role="status">Loading goals…</p>;
  if (displayed.status === "forbidden") return <SectionUnavailable />;
  if (displayed.status === "error")
    return <SectionError loading={loading} retry={() => request(null, false)} />;

  return (
    <Card className="border-slate-800 bg-slate-900 text-slate-50">
      <CardHeader>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-300">Read-only</p>
        <CardTitle>
          <h2>Goals</h2>
        </CardTitle>
        <CardDescription className="text-slate-400">
          Consented goal summaries for this athlete. Target dates are date-only records.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {failedCursor !== undefined ? (
          <div aria-live="assertive" role="alert" className="mb-3 text-sm text-amber-200">
            Goals could not be loaded.{" "}
            <Button
              className="text-cyan-200 hover:text-cyan-100 focus-visible:ring-cyan-300"
              onClick={() => request(failedCursor, Boolean(failedCursor))}
              type="button"
              variant="link"
            >
              Retry
            </Button>
          </div>
        ) : null}
        {loading ? (
          <p aria-live="polite" role="status" className="mb-3 text-sm text-slate-400">
            Loading goals…
          </p>
        ) : null}
        {displayed.items.length ? (
          <ul aria-label="Goals" className="space-y-2">
            {displayed.items.map((goal) => (
              <li
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800 p-3"
                key={goal.id}
              >
                <div>
                  <p className="font-medium">{goal.name}</p>
                  <p className="text-sm text-slate-400">
                    Target date: {goal.targetDate} · {goal.category} · Priority {goal.priority}
                  </p>
                </div>
                <Badge className="border-cyan-800 bg-cyan-950 text-cyan-200">
                  {goal.status === "unavailable"
                    ? "Lifecycle unavailable: athlete planning timezone is not set"
                    : `Lifecycle: ${goal.status.replaceAll("_", " ")}`}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">No goals are shared for this athlete.</p>
        )}
        {displayed.nextCursor ? (
          <DarkButton disabled={loading} onClick={() => request(displayed.nextCursor, true)}>
            Load more goals
          </DarkButton>
        ) : null}
      </CardContent>
    </Card>
  );
}

const darkButton =
  "mt-3 border-slate-600 bg-slate-900 text-slate-100 hover:bg-slate-800 hover:text-white focus-visible:ring-cyan-300 disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500";
function DarkButton({ children, ...props }: ComponentProps<typeof Button>) {
  return (
    <Button className={darkButton} type="button" variant="outline" {...props}>
      {children}
    </Button>
  );
}
function SectionUnavailable() {
  return (
    <Card className="border-slate-800 bg-slate-900 text-slate-50">
      <CardHeader>
        <CardTitle>
          <h2>Goals unavailable</h2>
        </CardTitle>
        <CardDescription className="text-slate-400">
          Goal sharing is not available for this athlete in the selected organization.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
function SectionError({ loading, retry }: { loading: boolean; retry: () => void }) {
  return (
    <Card className="border-slate-800 bg-slate-900 text-slate-50">
      <CardHeader>
        <CardTitle>
          <h2>Goals could not be loaded</h2>
        </CardTitle>
        <CardDescription className="text-slate-400">
          The athlete overview is still available. Retry this goals section.
        </CardDescription>
        <DarkButton disabled={loading} onClick={retry}>
          Retry goals
        </DarkButton>
      </CardHeader>
    </Card>
  );
}
