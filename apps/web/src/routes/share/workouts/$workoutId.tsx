import { compileActivityPlanV3 } from "@repo/core/activity-plan";
import { Badge } from "@repo/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { Dumbbell } from "lucide-react";

import { describeStructure, loadPublicWorkout } from "../../../lib/public-share";

export const Route = createFileRoute("/share/workouts/$workoutId")({
  loader: async ({ params }) => {
    const data = await loadPublicWorkout({ data: { id: params.workoutId } });
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => {
    const title = loaderData
      ? `${loaderData.workout.name} | GradientPeak`
      : "Workout | GradientPeak";
    const description = loaderData?.workout.description ?? "Public GradientPeak workout.";
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
  component: PublicWorkoutPage,
});

function PublicWorkoutPage() {
  const { workout } = Route.useLoaderData();
  const ownerName = workout.owner.name ?? workout.owner.username ?? "GradientPeak athlete";
  const compiledWorkout = compileActivityPlanV3(workout.structure);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 py-8">
      <header className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {compiledWorkout.categories.map((category) => (
            <Badge key={category} variant="outline" className="capitalize">
              {category}
            </Badge>
          ))}
        </div>
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">{workout.name}</h1>
          <p className="mt-2 text-muted-foreground">
            Shared by {workout.is_system_template ? "GradientPeak" : ownerName}
          </p>
        </div>
        {workout.description ? (
          <p className="text-lg leading-7 text-muted-foreground">{workout.description}</p>
        ) : null}
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Dumbbell className="h-5 w-5 text-muted-foreground" /> Workout overview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Detail label="Categories" value={compiledWorkout.categories.join(" → ")} />
            <Detail label="Structure" value={describeStructure(workout.structure)} />
            <Detail label="Version" value={`V${compiledWorkout.structureVersion}`} />
            <Detail label="Template" value={workout.is_system_template ? "System" : "Athlete"} />
          </div>
          {workout.notes ? (
            <p className="rounded-lg border p-4 text-sm text-muted-foreground">{workout.notes}</p>
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
