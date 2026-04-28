import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, MapPin, Route as RouteIcon } from "lucide-react";
import { RoutePreviewMap } from "../../../../components/recording/route-preview-map";
import { api } from "../../../../lib/api/client";
import { formatDistance, validateRecordingSearch } from "../../../../lib/recording-web";

export const Route = createFileRoute("/_protected/record/route-preview/$routeId")({
  validateSearch: (search: Record<string, unknown>) => validateRecordingSearch(search),
  component: RecordRoutePreviewPage,
});

function RecordRoutePreviewPage() {
  const navigate = Route.useNavigate();
  const launcher = Route.useSearch();
  const { routeId } = Route.useParams();
  const routeQuery = api.routes.get.useQuery({ id: routeId });
  const fullRouteQuery = api.routes.loadFull.useQuery({ id: routeId });

  const attachRoute = () => {
    if (!routeQuery.data) {
      return;
    }

    void navigate({
      to: "/record",
      search: {
        ...launcher,
        routeId,
      },
    });
  };

  if (routeQuery.isLoading || fullRouteQuery.isLoading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-border bg-card">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!routeQuery.data || !fullRouteQuery.data) {
    return (
      <Card>
        <CardContent className="space-y-3 py-10 text-center">
          <p className="font-medium text-foreground">Route not available</p>
          <p className="text-sm text-muted-foreground">
            This route could not be loaded for preview.
          </p>
          <div className="flex justify-center">
            <Button asChild variant="outline">
              <Link to="/record/route" search={launcher}>
                Back to route picker
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const route = routeQuery.data;
  const fullRoute = fullRouteQuery.data;
  const isAttached = launcher.routeId === route.id;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Route preview</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Browser preview uses stored route geometry instead of a mobile-only map runtime.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/record/route" search={launcher}>
            Back to route picker
          </Link>
        </Button>
      </div>

      <RoutePreviewMap coordinates={fullRoute.coordinates} />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <CardTitle>{route.name}</CardTitle>
              <CardDescription>
                {route.description || "Saved route ready to attach to your recording launcher."}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{formatDistance(route.total_distance)}</Badge>
              {isAttached ? <Badge>Currently attached</Badge> : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 text-sm md:grid-cols-2">
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                Distance
              </div>
              <p className="mt-1 text-muted-foreground">{formatDistance(route.total_distance)}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <RouteIcon className="h-4 w-4 text-muted-foreground" />
                Geometry points
              </div>
              <p className="mt-1 text-muted-foreground">
                {fullRoute.coordinates.length} loaded from storage
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={attachRoute}>{isAttached ? "Keep attached" : "Attach route"}</Button>
            <Button asChild variant="outline">
              <Link to="/record/route" search={launcher}>
                Cancel
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
