import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@repo/ui/components/alert-dialog";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  DetailMetricGrid,
  DetailPageIntro,
  ElevationProfileCard,
  EntityMapCard,
  LikeToggleButton,
  OwnerSummary,
} from "../../../../components/protected/activity-route-primitives";
import { EntityCommentsCard } from "../../../../components/protected/entity-comments-card";
import { useAuth } from "../../../../components/providers/auth-provider";
import {
  formatDate,
  formatDistance,
  formatElevation,
} from "../../../../lib/activity-route-helpers";
import { api } from "../../../../lib/api/client";

export const Route = createFileRoute("/_protected/routes/$routeId/")({
  component: RouteDetailPage,
});

function RouteDetailPage() {
  const { user } = useAuth();
  const utils = api.useUtils();
  const navigate = Route.useNavigate();
  const { routeId } = Route.useParams();
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const routeQuery = api.routes.get.useQuery({ id: routeId });
  const routeFullQuery = api.routes.loadFull.useQuery({ id: routeId });
  const route = routeQuery.data;
  const isOwner = user?.id === route?.profile_id;
  const toggleLikeMutation = api.social.toggleLike.useMutation({
    onError: () => {
      setLiked(route?.has_liked ?? false);
      setLikesCount(route?.likes_count ?? 0);
      toast.error("Like update failed");
    },
  });
  const deleteMutation = api.routes.delete.useMutation({
    onSuccess: async () => {
      await utils.routes.invalidate();
      toast.success("Route deleted");
      void navigate({ to: "/routes" });
    },
  });

  useEffect(() => {
    setLiked(route?.has_liked ?? false);
    setLikesCount(route?.likes_count ?? 0);
  }, [route?.has_liked, route?.likes_count]);

  const coordinates = useMemo(
    () => routeFullQuery.data?.coordinates ?? [],
    [routeFullQuery.data?.coordinates],
  );

  if (routeQuery.isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!route) {
    return (
      <div className="container mx-auto max-w-3xl py-10">
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Route not found.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl space-y-6 py-4">
      <DetailPageIntro
        actions={
          <>
            <LikeToggleButton
              count={likesCount}
              liked={liked}
              onClick={() => {
                const nextLiked = !liked;
                setLiked(nextLiked);
                setLikesCount((current) => (nextLiked ? current + 1 : Math.max(0, current - 1)));
                toggleLikeMutation.mutate({ entity_id: route.id, entity_type: "route" });
              }}
              pending={toggleLikeMutation.isPending}
            />
            {isOwner ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="destructive">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete route?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes the route library entry and its stored GPX file.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deleteMutation.mutate({ id: route.id })}>
                      Delete route
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
          </>
        }
        badges={[route.is_public ? "Public" : "Private", `Saved ${formatDate(route.created_at)}`]}
        description={route.description || "No route description yet."}
        eyebrow="Route detail"
        title={route.name}
      />

      <DetailMetricGrid
        items={[
          { label: "Distance", value: formatDistance(route.total_distance) },
          { label: "Ascent", value: formatElevation(route.total_ascent) },
          { label: "Descent", value: formatElevation(route.total_descent) },
          { label: "Visibility", value: route.is_public ? "Public" : "Private" },
        ]}
      />

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <EntityMapCard
          coordinates={coordinates}
          emptyMessage="This route does not have enough coordinate data for a map preview."
          subtitle="Reusable browser-native route preview without a separate mapping dependency."
          title="Map preview"
        />
        <OwnerSummary owner={route.owner} />
      </div>

      <ElevationProfileCard coordinates={coordinates} />

      <EntityCommentsCard
        entityId={route.id}
        entityType="route"
        helperText="Share notes about terrain, route conditions, or why you saved this route."
        testId="route-comments"
      />
    </div>
  );
}
