import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { useEffect, useState } from "react";
import { acknowledgeCoachAthleteCompletedActivity } from "../../../lib/coaching/athlete-completions-server-functions";

type Result =
  | { status: "forbidden" }
  | { status: "error" }
  | {
      status: "granted";
      items: ReadonlyArray<{
        activityCategory: string | null;
        activityId: string;
        distanceMeters: number | null;
        evidenceVersion: string;
        elapsedMs: number | null;
        planningDate: string;
        sessionId: string;
      }>;
    };

function details(item: Extract<Result, { status: "granted" }>["items"][number]) {
  const parts = [item.activityCategory ?? "Activity category unavailable"];
  if (item.elapsedMs !== null) parts.push(`${Math.round(item.elapsedMs / 60_000)} min`);
  if (item.distanceMeters !== null) parts.push(`${(item.distanceMeters / 1000).toFixed(1)} km`);
  return parts.join(" · ");
}

/** Read-only review queue. Opening it never acknowledges or changes athlete activity. */
export function CoachAthleteCompletedActivities({
  actorProfileId,
  athleteProfileId,
  organizationId,
  result,
  onRetry = () => Promise.resolve(window.location.reload()),
}: {
  actorProfileId: string;
  athleteProfileId: string;
  organizationId: string;
  result: Result;
  onRetry?: () => void | Promise<void>;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accessRevoked, setAccessRevoked] = useState(false);
  const contextKey = `${actorProfileId}:${organizationId}:${athleteProfileId}`;
  useEffect(() => {
    setPending(null);
    setError(null);
    setAccessRevoked(false);
  }, [contextKey]);
  if (result.status === "error")
    return (
      <Card className="border-slate-800 bg-slate-900 text-slate-50">
        <CardHeader>
          <CardTitle>Completed activities could not be loaded</CardTitle>
          <CardDescription className="text-slate-400" role="alert">
            A loading error occurred. This does not mean the athlete changed sharing permissions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={onRetry}>Retry completed activities</Button>
        </CardContent>
      </Card>
    );
  if (result.status === "forbidden" || accessRevoked)
    return (
      <Card className="border-slate-800 bg-slate-900 text-slate-50">
        <CardHeader>
          <CardTitle>Completed activities unavailable</CardTitle>
          <CardDescription className="text-slate-400">
            Activity and calendar sharing are both required to review completed sessions.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  const items = result.items;
  async function acknowledge(item: Extract<Result, { status: "granted" }>["items"][number]) {
    setPending(item.sessionId);
    setError(null);
    try {
      const outcome = await acknowledgeCoachAthleteCompletedActivity({
        data: {
          athleteProfileId,
          evidenceVersion: item.evidenceVersion,
          organizationId,
          sessionId: item.sessionId,
        },
      });
      if (outcome.outcome === "forbidden") {
        setAccessRevoked(true);
        await onRetry();
        return;
      }
      // Do not optimistically hide by session ID: another engagement or newer
      // evidence can still be pending. Reload the authoritative queue instead.
      await onRetry();
    } catch {
      setError("Review acknowledgement could not be confirmed. Retry safely.");
    } finally {
      setPending(null);
    }
  }
  return (
    <Card className="border-slate-800 bg-slate-900 text-slate-50">
      <CardHeader>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-300">Read-only</p>
        <CardTitle>Completed activities</CardTitle>
        <CardDescription className="text-slate-400">
          Linked completions awaiting your review. Opening this list does not mark anything
          reviewed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <p role="alert" className="mb-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {items.length ? (
          <ul className="space-y-3" aria-label="Completed activities">
            {items.map((item) => (
              <li className="rounded border border-slate-800 p-3" key={item.sessionId}>
                <p className="font-medium">Completed session</p>
                <p className="text-sm text-slate-400">
                  Planned {item.planningDate} · {details(item)}
                </p>
                <Button
                  className="mt-3"
                  disabled={pending === item.sessionId}
                  onClick={() => acknowledge(item)}
                >
                  {pending === item.sessionId ? "Marking reviewed…" : "Mark reviewed"}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">No linked completed activities are available.</p>
        )}
      </CardContent>
    </Card>
  );
}
