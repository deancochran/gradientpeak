import { createFileRoute } from "@tanstack/react-router";
import { DetailPageIntro } from "../../components/protected/activity-route-primitives";
import { TrendsDashboard } from "../../components/trends/trends-dashboard";

export const Route = createFileRoute("/_protected/trends")({
  component: TrendsPage,
});

function TrendsPage() {
  return (
    <div className="container mx-auto max-w-6xl space-y-6 py-4">
      <DetailPageIntro
        description="Real profile, load, volume, consistency, performance, intensity, and peak evidence with source-specific recovery."
        eyebrow="Analytics"
        title="Trends"
      />
      <TrendsDashboard />
    </div>
  );
}
