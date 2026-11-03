import type { ActivityPlanSummary, ScheduledActivityPlanSummary } from "@repo/core";
import { deriveActivityPlanPresentation } from "@repo/core/activity-plan";
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Badge } from "@repo/ui/components/badge";
import { Heart } from "lucide-react";

import { getActivityBadgeLabel } from "../../lib/activity-route-helpers";
import { AppHrefLink } from "../app-href-link";
import { ActivityPlanEstimateRow } from "./activity-plan-estimates";
import { ActivityPlanTimelineChart } from "./activity-plan-timeline-chart";

export function ActivityPlanCard({
  href,
  openLabel,
  onOpen,
  plan,
  selected,
  disabled = false,
}: {
  href?: string;
  openLabel?: string;
  onOpen?: () => void;
  plan: ActivityPlanSummary | ScheduledActivityPlanSummary;
  selected?: boolean;
  disabled?: boolean;
}) {
  const presentation = deriveActivityPlanPresentation(plan.structure);
  const ownerLabel = plan.owner?.username
    ? `@${plan.owner.username}`
    : plan.isSystemTemplate
      ? "GradientPeak"
      : "GradientPeak athlete";
  const initials = (plan.owner?.username ?? "GP").slice(0, 2).toUpperCase();

  const content = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar className="h-8 w-8 shrink-0">
            {plan.owner?.avatarUrl ? <AvatarImage alt="" src={plan.owner.avatarUrl} /> : null}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <span className="truncate text-sm font-medium text-muted-foreground">{ownerLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{getActivityBadgeLabel(plan.activityCategory)}</Badge>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Heart aria-hidden="true" className="h-3.5 w-3.5" />
            {plan.engagement.likes} {plan.engagement.likes === 1 ? "like" : "likes"}
          </span>
        </div>
      </div>

      <div className="mt-4 min-w-0">
        <h2 className="text-lg font-semibold">{plan.name}</h2>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
          {plan.description || "No description provided."}
        </p>
      </div>

      <div className="mt-4">
        <ActivityPlanEstimateRow compact metrics={plan.metrics} />
      </div>

      {presentation?.occurrences.length ? (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-medium text-foreground">Activity prescription</p>
          <ActivityPlanTimelineChart
            compact
            height={72}
            presentation={presentation}
            testIDPrefix={`activity-plan-card-timeline-${plan.id}`}
          />
        </div>
      ) : null}
    </>
  );

  const className = `block w-full rounded-2xl border bg-card p-5 text-left transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "border-primary ring-1 ring-primary" : ""} ${disabled ? "cursor-not-allowed opacity-60" : ""}`;
  const accessibilityLabel = openLabel ?? `Open activity plan ${plan.name}`;
  if (href) {
    return (
      <AppHrefLink
        aria-label={accessibilityLabel}
        className={className}
        data-testid={`activity-plan-card-${plan.id}`}
        href={href}
      >
        {content}
      </AppHrefLink>
    );
  }
  return (
    <button
      aria-label={accessibilityLabel}
      aria-pressed={selected}
      disabled={disabled}
      className={className}
      data-testid={`activity-plan-card-${plan.id}`}
      onClick={onOpen}
      type="button"
    >
      {content}
    </button>
  );
}
