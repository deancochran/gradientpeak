import { Card, CardContent } from "@repo/ui/components/card";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { Mountain, RouteIcon } from "lucide-react";
import type { ReactNode } from "react";

import { loadPublicRoute } from "../../../lib/public-share";

export const Route = createFileRoute("/share/routes/$routeId")({
  loader: async ({ params }) => {
    const data = await loadPublicRoute({ data: { id: params.routeId } });
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => {
    const title = loaderData ? `${loaderData.route.name} | GradientPeak` : "Route | GradientPeak";
    const description = loaderData?.route.description ?? "Public GradientPeak route.";
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
  component: PublicRoutePage,
});

function formatDistance(meters: number) {
  return meters >= 1_000 ? `${(meters / 1_000).toFixed(1)} km` : `${meters} m`;
}

function PublicRoutePage() {
  const { route } = Route.useLoaderData();
  const ownerName = route.owner.name ?? route.owner.username ?? "GradientPeak athlete";

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 py-8">
      <header className="space-y-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">{route.name}</h1>
          <p className="mt-2 text-muted-foreground">
            Shared by {route.isSystemTemplate ? "GradientPeak" : ownerName}
          </p>
        </div>
        {route.description ? (
          <p className="text-lg leading-7 text-muted-foreground">{route.description}</p>
        ) : null}
      </header>

      <section className="grid gap-4 sm:grid-cols-3" aria-label="Route summary">
        <Metric
          icon={<RouteIcon className="h-5 w-5" />}
          label="Distance"
          value={formatDistance(route.totalDistanceMeters)}
        />
        <Metric
          icon={<Mountain className="h-5 w-5" />}
          label="Climb"
          value={
            route.totalAscentMeters === null ? "Not available" : `${route.totalAscentMeters} m`
          }
        />
        <Metric
          icon={<Mountain className="h-5 w-5" />}
          label="Descent"
          value={
            route.totalDescentMeters === null ? "Not available" : `${route.totalDescentMeters} m`
          }
        />
      </section>
    </main>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
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
