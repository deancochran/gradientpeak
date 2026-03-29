"use client";

import { invalidateRelationshipQueries } from "@repo/trpc/react";
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import {
  Clock,
  Loader2,
  Lock,
  MessageSquare,
  UserCheck,
  UserMinus,
  UserPlus,
  UserRound,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/components/providers/auth-provider";
import { trpc } from "@/lib/trpc/client";

export default function UserProfilePage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.userId as string;
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const isSelf = user?.id === userId;

  const {
    data: profile,
    isLoading,
    error,
  } = trpc.profiles.getPublicById.useQuery({ id: userId }, { enabled: !!userId });

  const followMutation = trpc.social.followUser.useMutation({
    onSuccess: async () => {
      await invalidateRelationshipQueries(utils, [userId, user?.id]);
      toast.success("Follow request sent");
    },
    onError: (err) => toast.error(err.message),
  });

  const unfollowMutation = trpc.social.unfollowUser.useMutation({
    onSuccess: async () => {
      await invalidateRelationshipQueries(utils, [userId, user?.id]);
      toast.success("Unfollowed user");
    },
    onError: (err) => toast.error(err.message),
  });

  const messageMutation = trpc.messaging.getOrCreateDM.useMutation({
    onSuccess: (data) => {
      router.push(`/messages`);
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="flex h-[400px] w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="container py-8 max-w-3xl">
        <Card>
          <CardContent className="py-10 text-center">
            <h2 className="text-xl font-semibold mb-2">User not found</h2>
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
    } else {
      followMutation.mutate({ target_user_id: userId });
    }
  };

  const handleMessage = () => {
    messageMutation.mutate({ target_user_id: userId });
  };

  const handleFollowersClick = () => {
    router.push(`/user/${userId}/followers`);
  };

  const handleFollowingClick = () => {
    router.push(`/user/${userId}/following`);
  };

  return (
    <div className="container py-8 max-w-3xl space-y-8">
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row items-center gap-6">
            <Avatar className="h-24 w-24">
              <AvatarImage src={profile.avatar_url || ""} alt={profile.username || "User"} />
              <AvatarFallback>
                <UserRound className="h-10 w-10" />
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 text-center md:text-left space-y-2">
              <div className="flex items-center justify-center md:justify-start gap-2">
                <h1 className="text-2xl font-bold">{profile.username || "Anonymous"}</h1>
                {isPrivate && <Lock className="h-4 w-4 text-muted-foreground" />}
              </div>

              {canViewDetails && profile.bio && (
                <p className="text-muted-foreground">{profile.bio}</p>
              )}

              {canViewDetails && (
                <div className="flex items-center justify-center md:justify-start gap-4 text-sm">
                  <button
                    onClick={handleFollowersClick}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <span className="font-semibold text-foreground">
                      {profile.followers_count ?? 0}
                    </span>{" "}
                    followers
                  </button>
                  <button
                    onClick={handleFollowingClick}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <span className="font-semibold text-foreground">
                      {profile.following_count ?? 0}
                    </span>{" "}
                    following
                  </button>
                </div>
              )}

              {!isSelf && (
                <div className="flex flex-col items-center md:items-start gap-3 mt-4">
                  {isPendingFollower && (
                    <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 rounded-md w-full justify-center">
                      <Clock className="h-4 w-4" />
                      <span className="font-medium">Follow request pending</span>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
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
                          <UserCheck className="mr-2 h-4 w-4" /> Following
                        </>
                      ) : isPendingFollower ? (
                        <>
                          <UserMinus className="mr-2 h-4 w-4" /> Requested
                        </>
                      ) : (
                        <>
                          <UserPlus className="mr-2 h-4 w-4" /> Follow
                        </>
                      )}
                    </Button>

                    <Button
                      variant="outline"
                      onClick={handleMessage}
                      disabled={messageMutation.isPending}
                      className="w-32"
                    >
                      <MessageSquare className="mr-2 h-4 w-4" /> Message
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {!canViewDetails ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center justify-center text-center">
            <Lock className="h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">This account is private</h2>
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
