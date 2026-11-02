import { Card, CardContent } from "@repo/ui/components/card";
import { Target } from "lucide-react";

export type WebGoalCardData = {
  id: string;
  objectiveSummary?: string | null;
  targetDate?: string | null;
  title: string;
  typeLabel?: string | null;
};

function formatTargetDate(dateKey: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return dateKey;
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(`${dateKey}T00:00:00.000Z`));
}

export function GoalCard({ goal, href }: { goal: WebGoalCardData; href: string }) {
  return (
    <Card
      className="transition-colors hover:border-amber-500/50"
      data-testid={`goal-card-${goal.id}`}
    >
      <CardContent className="p-0">
        <a
          aria-label={`Open goal ${goal.title}`}
          className="flex items-start gap-3 rounded-xl p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href={href}
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-600">
            <Target aria-hidden="true" className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-foreground">{goal.title}</span>
            {goal.objectiveSummary ? (
              <span className="mt-1 block text-sm text-muted-foreground">
                {goal.objectiveSummary}
              </span>
            ) : null}
            <span className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {goal.typeLabel ? <span>{goal.typeLabel}</span> : null}
              {goal.targetDate ? <span>{formatTargetDate(goal.targetDate)}</span> : null}
            </span>
          </span>
        </a>
      </CardContent>
    </Card>
  );
}
