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
import { RouteEventAttachment } from "../../../../components/routes/route-event-attachment";
import { useViewingUserPreferredUnitSystem } from "../../../../hooks/use-viewing-user-preferred-unit-system";
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
  const { unitSystem } = useViewingUserPreferredUnitSystem();
  const utils = api.useUtils();
  const navigate = Route.useNavigate();
  const { routeId } = Route.useParams();
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [deleteError, setDeleteError] = useState<string | null>(null);
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
      void navigate({
        to: "/routes",
        search: {
          search: "",
          ownerScope: "own",
          sort: "newest",
          minDistanceKm: "",
          maxDistanceKm: "",
          minAscentM: "",
          maxAscentM: "",
          page: 1,
        },
      });
    },
    onError: (error) => {
      setDeleteError(error.message || "Route deletion failed");
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
                      This removes the route library entry and its stored route file.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        setDeleteError(null);
                        deleteMutation.mutate({ id: route.id });
                      }}
                    >
                      {deleteMutation.isPending ? "Deleting..." : "Delete route"}
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
          { label: "Distance", value: formatDistance(route.total_distance, unitSystem) },
          { label: "Ascent", value: formatElevation(route.total_ascent, unitSystem) },
          { label: "Descent", value: formatElevation(route.total_descent, unitSystem) },
          { label: "Visibility", value: route.is_public ? "Public" : "Private" },
        ]}
      />

      {deleteError ? (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4" role="alert">
          <p className="font-medium text-destructive">Route could not be deleted</p>
          <p className="mt-1 text-sm text-muted-foreground">{deleteError}</p>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <EntityMapCard
          coordinates={coordinates}
          emptyMessage="This route does not have enough coordinate data for a map preview."
          subtitle="Reusable browser-native route preview without a separate mapping dependency."
          title="Map preview"
        />
        <OwnerSummary owner={route.owner} />
      </div>

      {routeFullQuery.isLoading ? (
        <p className="text-sm text-muted-foreground" role="status">
          Loading stored route geometry...
        </p>
      ) : routeFullQuery.isError ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-4"
          role="alert"
        >
          <p className="text-sm text-destructive">
            Stored route geometry could not be loaded. The saved route metadata is still available.
          </p>
          <Button onClick={() => void routeFullQuery.refetch()} type="button" variant="outline">
            Retry geometry
          </Button>
        </div>
      ) : null}

      <ElevationProfileCard coordinates={coordinates} />

      {isOwner ? <RouteEventAttachment routeId={route.id} /> : null}

      <EntityCommentsCard
        entityId={route.id}
        entityType="route"
        helperText="Share notes about terrain, route conditions, or why you saved this route."
        testId="route-comments"
      />
    </div>
  );
}
