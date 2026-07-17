import { Badge } from "@repo/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";

import { describeStructure, loadPublicTrainingPlan } from "../../../lib/public-share";

export const Route = createFileRoute("/share/training-plans/$trainingPlanId")({
  loader: async ({ params }) => {
    const data = await loadPublicTrainingPlan({ data: { id: params.trainingPlanId } });
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => {
    const title = loaderData
      ? `${loaderData.trainingPlan.name} | GradientPeak`
      : "Training plan | GradientPeak";
    const description =
      loaderData?.trainingPlan.description ?? "Public GradientPeak training plan.";
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
  component: PublicTrainingPlanPage,
});

function PublicTrainingPlanPage() {
  const { trainingPlan } = Route.useLoaderData();
  const ownerName =
    trainingPlan.owner.name ?? trainingPlan.owner.username ?? "GradientPeak athlete";

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 py-8">
      <header className="space-y-4">
        <Badge variant="outline" className="w-fit">
          Training plan
        </Badge>
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">{trainingPlan.name}</h1>
          <p className="mt-2 text-muted-foreground">
            Shared by {trainingPlan.is_system_template ? "GradientPeak" : ownerName}
          </p>
        </div>
        {trainingPlan.description ? (
          <p className="text-lg leading-7 text-muted-foreground">{trainingPlan.description}</p>
        ) : null}
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-muted-foreground" /> Plan overview
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Detail label="Structure" value={describeStructure(trainingPlan.structure)} />
          <Detail
            label="Sessions per week"
            value={trainingPlan.sessions_per_week_target?.toString() ?? "Not specified"}
          />
          <Detail
            label="Duration"
            value={
              trainingPlan.duration_hours ? `${trainingPlan.duration_hours} hours` : "Not specified"
            }
          />
          <Detail label="Template" value={trainingPlan.is_system_template ? "System" : "Athlete"} />
        </CardContent>
      </Card>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}
