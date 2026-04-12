import { invalidateRelationshipQueries } from "@repo/api/react";
import { normalizePublicProfileView } from "@repo/core/profile";
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Clock, Loader2, Lock, MessageSquare, UserCheck, UserMinus, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "../../../../components/providers/auth-provider";
import { api } from "../../../../lib/api/client";

export const Route = createFileRoute("/_protected/user/$userId/")({
  component: UserProfilePage,
});

function UserProfilePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { userId } = Route.useParams();
  const utils = api.useUtils();
  const profileQuery = api.profiles.getPublicById.useQuery(
    { id: userId },
    { enabled: Boolean(userId) },
  );
  const profile = normalizePublicProfileView(profileQuery.data);
  const isSelf = user?.id === userId;

  const followMutation = api.social.followUser.useMutation({
    onSuccess: async () => {
      await invalidateRelationshipQueries(utils, [userId, user?.id]);
      toast.success("Follow request sent");
    },
    onError: (error) => toast.error(error.message),
  });

  const unfollowMutation = api.social.unfollowUser.useMutation({
    onSuccess: async () => {
      await invalidateRelationshipQueries(utils, [userId, user?.id]);
      toast.success("Unfollowed user");
    },
    onError: (error) => toast.error(error.message),
  });

  const messageMutation = api.messaging.getOrCreateDM.useMutation({
    onSuccess: async () => navigate({ to: "/messages" }),
    onError: (error) => toast.error(error.message),
  });

  if (profileQuery.isLoading) {
    return (
      <div className="flex h-[400px] w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (profileQuery.error || !profile) {
    return (
      <div className="container max-w-3xl py-8">
        <Card>
          <CardContent className="py-10 text-center">
            <h2 className="mb-2 text-xl font-semibold">User not found</h2>
            <p className="text-muted-foreground">The user you are looking for does not exist.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isPrivate = profile.is_public === false;
  const isAcceptedFollower = profile.follow_status === "accepted";
  const isPendingFollower = profile.follow_status === "pending";
  const canViewDetails = isSelf || !isPrivate || isAcceptedFollower;

  const handleFollowToggle = () => {
    if (isAcceptedFollower || isPendingFollower) {
      unfollowMutation.mutate({ target_user_id: userId });
      return;
    }

    followMutation.mutate({ target_user_id: userId });
  };

  const handleMessage = () => {
    messageMutation.mutate({ target_user_id: userId });
  };

  const profileInitials = (profile.username || "GP").slice(0, 2).toUpperCase();

  return (
    <div className="container max-w-3xl space-y-8 py-8">
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center gap-6 md:flex-row">
            <Avatar className="h-24 w-24">
              <AvatarImage src={profile.avatar_url || ""} alt={profile.username || "User"} />
              <AvatarFallback>{profileInitials}</AvatarFallback>
            </Avatar>

            <div className="flex-1 space-y-2 text-center md:text-left">
              <div className="flex items-center justify-center gap-2 md:justify-start">
                <h1 className="text-2xl font-bold">{profile.username || "Anonymous"}</h1>
                {isPrivate ? <Lock className="h-4 w-4 text-muted-foreground" /> : null}
              </div>

              {canViewDetails && profile.bio ? (
                <p className="text-muted-foreground">{profile.bio}</p>
              ) : null}

              {canViewDetails ? (
                <div className="flex items-center justify-center gap-4 text-sm md:justify-start">
                  <Button
                    asChild
                    variant="ghost"
                    className="h-auto p-0 text-muted-foreground hover:text-foreground"
                  >
                    <Link to="/user/$userId/followers" params={{ userId }}>
                      <span className="font-semibold text-foreground">
                        {profile.followers_count ?? 0}
                      </span>{" "}
                      followers
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="ghost"
                    className="h-auto p-0 text-muted-foreground hover:text-foreground"
                  >
                    <Link to="/user/$userId/following" params={{ userId }}>
                      <span className="font-semibold text-foreground">
                        {profile.following_count ?? 0}
                      </span>{" "}
                      following
                    </Link>
                  </Button>
                </div>
              ) : null}

              {!isSelf ? (
                <div className="mt-4 flex flex-col items-center gap-3 md:items-start">
                  {isPendingFollower ? (
                    <div className="flex w-full items-center justify-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-600 dark:bg-amber-950/30 dark:text-amber-500">
                      <Clock className="h-4 w-4" />
                      <span className="font-medium">Follow request pending</span>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center justify-center gap-3 md:justify-start">
                    <Button
                      variant={
                        isAcceptedFollower ? "outline" : isPendingFollower ? "secondary" : "default"
                      }
                      onClick={handleFollowToggle}
                      disabled={followMutation.isPending || unfollowMutation.isPending}
                      className="w-32"
                    >
                      {isAcceptedFollower ? (
                        <>
                          <UserCheck className="mr-2 h-4 w-4" />
                          Following
                        </>
                      ) : isPendingFollower ? (
                        <>
                          <UserMinus className="mr-2 h-4 w-4" />
                          Requested
                        </>
                      ) : (
                        <>
                          <UserPlus className="mr-2 h-4 w-4" />
                          Follow
                        </>
                      )}
                    </Button>

                    <Button
                      variant="outline"
                      onClick={handleMessage}
                      disabled={messageMutation.isPending}
                      className="w-32"
                    >
                      <MessageSquare className="mr-2 h-4 w-4" />
                      Message
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      {!canViewDetails ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Lock className="mb-4 h-12 w-12 text-muted-foreground" />
            <h2 className="mb-2 text-xl font-semibold">This account is private</h2>
            <p className="text-muted-foreground">
              Follow this account to see their activities and stats.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Recent Activities</CardTitle>
              <CardDescription>Activities will appear here</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">No recent activities found.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Stats</CardTitle>
              <CardDescription>Training stats will appear here</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">No stats available.</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
