import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { cn } from "@repo/ui/lib/cn";
import { Heart, MapPin } from "lucide-react";
import type { ReactNode } from "react";
import { useViewingUserPreferredUnitSystem } from "../../hooks/use-viewing-user-preferred-unit-system";
import {
  buildElevationPolylinePoints,
  buildMapPolylinePoints,
  formatCompactDuration,
  formatDate,
  formatDateTime,
  formatDistance,
  formatDuration,
  formatElevation,
  getActivityBadgeLabel,
  type RouteCoordinate,
} from "../../lib/activity-route-helpers";
import { ActivityCategoryBadges } from "../activity-category-presentation";

type DetailMetricItem = {
  label: string;
  value: string;
};

export function DetailPageIntro({
  actions,
  badges,
  categories,
  description,
  eyebrow,
  title,
}: {
  actions?: ReactNode;
  badges?: string[];
  categories?: readonly string[];
  description?: string | null;
  eyebrow?: string;
  title?: string;
}) {
  const hasActions = Boolean(actions);

  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-6 lg:flex-row lg:items-start lg:justify-between">
      <div className="space-y-3">
        {eyebrow ? <p className="text-sm font-medium text-primary">{eyebrow}</p> : null}
        <div className="space-y-2">
          {title ? (
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
          ) : null}
          {description ? (
            <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {categories !== undefined || badges?.length ? (
          <div className="flex flex-wrap gap-2">
            {categories !== undefined ? <ActivityCategoryBadges categories={categories} /> : null}
            {badges?.map((badge) => (
              <Badge key={badge} variant="secondary">
                {badge}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>
      {hasActions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function DetailMetricGrid({ items }: { items: DetailMetricItem[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label}>
          <CardContent className="space-y-2 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</p>
            <p className="text-xl font-semibold text-foreground">{item.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function EntityMapCard({
  coordinates,
  emptyMessage,
  subtitle,
  title,
}: {
  coordinates: RouteCoordinate[];
  emptyMessage: string;
  subtitle?: string;
  title: string;
}) {
  const points = buildMapPolylinePoints(coordinates);

  return (
    <Card>
      <CardHeader>
        <CardTitle aria-level={2} role="heading">
          {title}
        </CardTitle>
        {subtitle ? <CardDescription>{subtitle}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        {points ? (
          <div className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-sky-50 via-background to-emerald-50 dark:from-sky-950/30 dark:to-emerald-950/20">
            <svg
              aria-label={`${title} map`}
              className="block h-72 w-full"
              preserveAspectRatio="none"
              role="img"
              viewBox="0 0 100 100"
            >
              <defs>
                <linearGradient id="route-line" x1="0%" x2="100%" y1="0%" y2="100%">
                  <stop offset="0%" stopColor="currentColor" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="currentColor" stopOpacity="0.65" />
                </linearGradient>
              </defs>
              <polyline
                className="text-primary"
                fill="none"
                points={points}
                stroke="url(#route-line)"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
              />
            </svg>
          </div>
        ) : (
          <div className="flex h-72 items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 px-6 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ElevationProfileCard({ coordinates }: { coordinates: RouteCoordinate[] }) {
  const points = buildElevationPolylinePoints(coordinates);

  if (!points) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Elevation profile</CardTitle>
        <CardDescription>Quick terrain preview from the stored route coordinates.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-2xl border border-border bg-muted/20 p-4">
          <svg
            aria-hidden="true"
            className="block h-32 w-full"
            preserveAspectRatio="none"
            viewBox="0 0 100 100"
          >
            <polyline
              className="text-primary"
              fill="none"
              points={points}
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.5"
            />
          </svg>
        </div>
      </CardContent>
    </Card>
  );
}

export function LikeToggleButton({
  count,
  liked,
  onClick,
  pending = false,
  retryLabel,
}: {
  count: number;
  liked: boolean;
  onClick: () => void;
  pending?: boolean;
  retryLabel?: string;
}) {
  return (
    <Button
      className={cn("gap-2", liked && "border-red-200 text-red-600 hover:text-red-600")}
      disabled={pending}
      onClick={onClick}
      type="button"
      variant="outline"
    >
      <Heart className={cn("h-4 w-4", liked && "fill-current")} />
      <span>
        {retryLabel ??
          (count > 0 ? `${count} like${count === 1 ? "" : "s"}` : liked ? "Liked" : "Like")}
      </span>
    </Button>
  );
}

function deriveCategoryLabel(categories: string[]) {
  if (!categories || categories.length === 0) return null;
  return [...new Set(categories)].map(getActivityBadgeLabel).join(" • ");
}

function formatDisplayMetric(metric: SemanticMetric, unitSystem: "metric" | "imperial") {
  if (metric.status === "unavailable") return "Unavailable";
  if (metric.unit === "meters") return formatDistance(metric.value, unitSystem);
  if (metric.unit === "seconds") return formatDuration(metric.value);
  if (metric.unit === "ratio") return metric.value.toFixed(2);
  if (metric.unit === "bpm") return `${Math.round(metric.value)} bpm`;
  if (metric.unit === "watts") return `${Math.round(metric.value)} W`;
  if (metric.unit === "kilocalories") return `${Math.round(metric.value)} kcal`;
  return Number.isInteger(metric.value) ? String(metric.value) : metric.value.toFixed(1);
}

export function ActivityListCard({
  activity,
  onOpen,
}: {
  activity: ActivityDisplayModel;
  onOpen?: () => void;
}) {
  const { unitSystem } = useViewingUserPreferredUnitSystem();
  return (
    <Card
      className="transition-colors hover:border-primary/30"
      data-testid={`activity-card-${activity.id}`}
    >
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-xs text-muted-foreground">@{activity.owner.username ?? "athlete"}</p>
            <h3 className="text-lg font-semibold text-foreground">{activity.title}</h3>
            {deriveCategoryLabel(activity.activityComposition.categories) ? (
              <Badge variant="secondary">
                {deriveCategoryLabel(activity.activityComposition.categories)}
              </Badge>
            ) : null}
            <p className="text-sm text-muted-foreground">
              {formatDateTime(activity.time.startedAt)}
            </p>
            {activity.notes ? (
              <p className="line-clamp-2 text-sm text-muted-foreground">{activity.notes}</p>
            ) : null}
          </div>
          {onOpen ? (
            <Button
              data-testid={`activity-card-${activity.id}-open`}
              onClick={onOpen}
              type="button"
              variant="ghost"
            >
              Open
            </Button>
          ) : null}
        </div>
        <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
          {activity.metrics.slice(0, 4).map((metric) => (
            <MetricPill
              key={metric.key}
              label={metric.status === "partial" ? `${metric.label} (partial)` : metric.label}
              value={formatDisplayMetric(metric, unitSystem)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function RouteListCard({ onOpen, route }: { onOpen: () => void; route: any }) {
  const { unitSystem } = useViewingUserPreferredUnitSystem();

  return (
    <Card
      className="transition-colors hover:border-primary/30"
      data-testid={`route-card-${route.id}`}
    >
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <MapPin className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-foreground">{route.name}</h3>
            </div>
            <p className="text-sm text-muted-foreground">Saved {formatDate(route.created_at)}</p>
            {route.description ? (
              <p className="line-clamp-2 text-sm text-muted-foreground">{route.description}</p>
            ) : null}
          </div>
          <Button
            data-testid={`route-card-${route.id}-open`}
            onClick={onOpen}
            type="button"
            variant="ghost"
          >
            Open
          </Button>
        </div>
        <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
          <MetricPill label="Distance" value={formatDistance(route.total_distance, unitSystem)} />
          <MetricPill label="Ascent" value={formatElevation(route.total_ascent, unitSystem)} />
          <MetricPill label="Descent" value={formatElevation(route.total_descent, unitSystem)} />
          <MetricPill label="Visibility" value={route.is_public ? "Public" : "Private"} />
        </div>
      </CardContent>
    </Card>
  );
}

export function ActivityEffortListCard({ effort, onOpen }: { effort: any; onOpen: () => void }) {
  return (
    <Card
      className="transition-colors hover:border-primary/30"
      data-testid={`activity-effort-card-${effort.id}`}
    >
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold capitalize text-foreground">
                {effort.activity_category} {effort.effort_type}
              </h3>
              <Badge variant="secondary">{formatDate(effort.recorded_at)}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Manual or imported best-effort reference.
            </p>
          </div>
          <Button
            data-testid={`activity-effort-card-${effort.id}-open`}
            onClick={onOpen}
            type="button"
            variant="ghost"
          >
            Open
          </Button>
        </div>
        <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
          <MetricPill label="Value" value={`${effort.value} ${effort.unit}`} />
          <MetricPill label="Duration" value={formatDuration(effort.duration_seconds)} />
          <MetricPill
            label="Start offset"
            value={effort.start_offset != null ? formatCompactDuration(effort.start_offset) : "-"}
          />
        </div>
      </CardContent>
    </Card>
  );
}

export function OwnerSummary({
  owner,
}: {
  owner: { id?: string | null; username?: string | null } | null | undefined;
}) {
  if (!owner) {
    return null;
  }

  const initials = (owner.username ?? "GP").slice(0, 2).toUpperCase();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Owner</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium text-foreground">
              {owner.username ?? "GradientPeak athlete"}
            </p>
            <p className="text-sm text-muted-foreground">Activity or route owner</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 px-3 py-2">
      <p className="text-xs uppercase tracking-wide">{label}</p>
      <p className="mt-1 font-medium text-foreground">{value}</p>
    </div>
  );
}

import type { ActivityDisplayModel, SemanticMetric } from "@repo/core";
