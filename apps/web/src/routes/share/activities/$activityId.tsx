import { Badge } from "@repo/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { Activity, Clock, Heart, RouteIcon } from "lucide-react";
import type { ReactNode } from "react";

import {
  deriveActivityCategoryDisplay,
  deriveActivityTimingDisplay,
  deriveCurrentArtifactLabel,
} from "../../../lib/activity-route-helpers";
import { loadPublicActivity } from "../../../lib/public-share";

export const Route = createFileRoute("/share/activities/$activityId")({
  loader: async ({ params }) => {
    const data = await loadPublicActivity({ data: { id: params.activityId } });
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => {
    const title = loaderData
      ? `${loaderData.activity.name} | GradientPeak`
      : "Activity | GradientPeak";
    const description = loaderData
      ? `${deriveActivityCategoryDisplay(loaderData.activity.segments).label} shared on GradientPeak.`
      : "Public GradientPeak activity.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { property: "og:url", content: loaderData?.canonicalUrl },
        { name: "twitter:card", content: "summary" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
      links: loaderData ? [{ rel: "canonical", href: loaderData.canonicalUrl }] : [],
    };
  },
  component: PublicActivityPage,
});

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatDistance(meters: number) {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${meters} m`;
}

function PublicActivityPage() {
  const { activity } = Route.useLoaderData();
  const startedAt = new Date(activity.started_at);
  const ownerName = activity.owner.name ?? activity.owner.username ?? "GradientPeak athlete";
  const categoryDisplay = deriveActivityCategoryDisplay(activity.segments);
  const timingDisplay = deriveActivityTimingDisplay(activity);
  const artifactLabel = deriveCurrentArtifactLabel(activity.current_artifact);

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 py-8">
      <header className="space-y-4">
        <Badge variant="outline" className="w-fit">
          {categoryDisplay.label}
        </Badge>
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">{activity.name}</h1>
          <p className="mt-2 text-muted-foreground">
            Shared by {ownerName} · {startedAt.toLocaleDateString()}
          </p>
        </div>
        {activity.notes ? (
          <p className="text-lg leading-7 text-muted-foreground">{activity.notes}</p>
        ) : null}
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Activity summary">
        <MetricCard
          icon={<Clock className="h-5 w-5" />}
          label="Elapsed"
          value={formatDuration(timingDisplay.elapsedSeconds)}
        />
        <MetricCard
          icon={<RouteIcon className="h-5 w-5" />}
          label="Distance"
          value={formatDistance(activity.distance_meters)}
        />
        <MetricCard
          icon={<Activity className="h-5 w-5" />}
          label={timingDisplay.coverage === "partial" ? "Moving (partial)" : "Moving time"}
          value={
            timingDisplay.movingSeconds === null
              ? "Not available"
              : formatDuration(timingDisplay.movingSeconds)
          }
        />
        <MetricCard
          icon={<Heart className="h-5 w-5" />}
          label="Likes"
          value={String(activity.likes_count)}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Performance details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <Detail
            label="Average heart rate"
            value={activity.avg_heart_rate ? `${activity.avg_heart_rate} bpm` : "Not shared"}
          />
          <Detail
            label="Max heart rate"
            value={activity.max_heart_rate ? `${activity.max_heart_rate} bpm` : "Not shared"}
          />
          <Detail
            label="Average power"
            value={activity.avg_power ? `${activity.avg_power} W` : "Not shared"}
          />
          <Detail
            label="Max power"
            value={activity.max_power ? `${activity.max_power} W` : "Not shared"}
          />
          <Detail
            label="Calories"
            value={activity.calories ? `${activity.calories} kcal` : "Not shared"}
          />
          <Detail
            label="Elevation gain"
            value={
              activity.elevation_gain_meters ? `${activity.elevation_gain_meters} m` : "Not shared"
            }
          />
          <Detail label="Source artifact" value={artifactLabel ?? "Not shared"} />
        </CardContent>
      </Card>
    </main>
  );
}

function MetricCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-5">
        <div className="rounded-full bg-muted p-2 text-muted-foreground">{icon}</div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
