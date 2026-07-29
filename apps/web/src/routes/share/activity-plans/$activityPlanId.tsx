import { compileActivityPlanV3 } from "@repo/core/activity-plan";
import { Badge } from "@repo/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { Dumbbell } from "lucide-react";

import { getActivityBadgeLabel, getActivityEmoji } from "../../../lib/activity-route-helpers";
import { describeStructure, loadPublicActivityPlan } from "../../../lib/public-share";

export const Route = createFileRoute("/share/activity-plans/$activityPlanId")({
  loader: async ({ params }) => {
    const data = await loadPublicActivityPlan({ data: { id: params.activityPlanId } });
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => {
    const title = loaderData
      ? `${loaderData.activityPlan.name} | GradientPeak`
      : "Activity Plan | GradientPeak";
    const description =
      loaderData?.activityPlan.description ?? "Public GradientPeak activity plan.";
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
  component: PublicActivityPlanPage,
});

function PublicActivityPlanPage() {
  const { activityPlan } = Route.useLoaderData();
  const ownerName =
    activityPlan.owner.name ?? activityPlan.owner.username ?? "GradientPeak athlete";
  const compiledActivityPlan = compileActivityPlanV3(activityPlan.structure);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 py-8">
      <header className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge className="gap-1.5" variant="secondary">
            <span aria-hidden="true">
              {getActivityEmoji(compiledActivityPlan.activity_category)}
            </span>
            {getActivityBadgeLabel(compiledActivityPlan.activity_category)}
          </Badge>
        </div>
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">{activityPlan.name}</h1>
          <p className="mt-2 text-muted-foreground">
            Shared by {activityPlan.is_system_template ? "GradientPeak" : ownerName}
          </p>
        </div>
        {activityPlan.description ? (
          <p className="text-lg leading-7 text-muted-foreground">{activityPlan.description}</p>
        ) : null}
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Dumbbell className="h-5 w-5 text-muted-foreground" /> Activity plan overview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Detail
              label="Activity category"
              value={getActivityBadgeLabel(compiledActivityPlan.activity_category)}
            />
            <Detail label="Structure" value={describeStructure(activityPlan.structure)} />
            <Detail label="Version" value={`V${compiledActivityPlan.structureVersion}`} />
            <Detail
              label="Template"
              value={activityPlan.is_system_template ? "System" : "Athlete"}
            />
          </div>
          {activityPlan.notes ? (
            <p className="rounded-lg border p-4 text-sm text-muted-foreground">
              {activityPlan.notes}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium capitalize">{value}</p>
    </div>
  );
}
