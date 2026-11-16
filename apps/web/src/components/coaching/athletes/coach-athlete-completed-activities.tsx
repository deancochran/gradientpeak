import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";

type Result =
  | { status: "forbidden" }
  | { status: "error" }
  | {
      status: "granted";
      items: ReadonlyArray<{
        activityCategory: string | null;
        activityId: string;
        distanceMeters: number | null;
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
  result,
  onRetry = () => window.location.reload(),
}: {
  result: Result;
  onRetry?: () => void;
}) {
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
  if (result.status === "forbidden")
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
        {result.items.length ? (
          <ul className="space-y-3" aria-label="Completed activities">
            {result.items.map((item) => (
              <li className="rounded border border-slate-800 p-3" key={item.sessionId}>
                <p className="font-medium">Completed session</p>
                <p className="text-sm text-slate-400">
                  Planned {item.planningDate} · {details(item)}
                </p>
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
