import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Link } from "@tanstack/react-router";
import { Loader2, Lock, UserRound } from "lucide-react";

type RelationshipProfile = {
  avatar_url: string | null;
  follow_status?: string | null;
  id: string;
  is_public: boolean | null;
  username: string | null;
};

export function RelationshipList({
  action,
  emptyMessage,
  errorMessage,
  getProfileLink,
  hasMore,
  isLoading,
  loadMoreLink,
  onRetry,
  title,
  total,
  users,
}: {
  action?: (profile: RelationshipProfile) => React.ReactNode;
  emptyMessage: string;
  errorMessage?: string;
  getProfileLink: (userId: string) => {
    params: { userId: string };
    search: { flash: undefined; flashType: undefined };
    to: "/user/$userId";
  };
  hasMore: boolean;
  isLoading: boolean;
  loadMoreLink?: React.ReactNode;
  onRetry?: () => void;
  title: string;
  total: number;
  users: readonly RelationshipProfile[];
}) {
  if (isLoading && users.length === 0) {
    return (
      <div className="flex h-[400px] w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (errorMessage && users.length === 0) {
    return (
      <Card>
        <CardContent className="flex min-h-52 flex-col items-center justify-center gap-4 text-center">
          <p className="font-medium">{errorMessage}</p>
          <p className="text-sm text-muted-foreground">
            Check your connection or profile access and try again.
          </p>
          {onRetry ? (
            <Button type="button" variant="outline" onClick={onRetry}>
              Try again
            </Button>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">{title.replace("{count}", String(total))}</h1>
        </div>

        {users.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">{emptyMessage}</p>
        ) : (
          <div className="space-y-4">
            {users.map((profile) => (
              <div
                key={profile.id}
                className="flex items-center justify-between gap-3 rounded-lg p-3 transition-colors hover:bg-accent/50"
              >
                <Link
                  {...getProfileLink(profile.id)}
                  className="flex flex-1 items-center gap-3 text-left"
                >
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={profile.avatar_url || ""} alt={profile.username || "User"} />
                    <AvatarFallback>
                      <UserRound className="h-6 w-6" />
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-medium">{profile.username || "Unknown user"}</div>
                    {profile.is_public === false ? (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Lock className="h-3 w-3" />
                        Private
                      </div>
                    ) : null}
                  </div>
                </Link>

                {action ? action(profile) : null}
              </div>
            ))}
          </div>
        )}

        {hasMore && loadMoreLink ? <div className="mt-4 text-center">{loadMoreLink}</div> : null}
      </CardContent>
    </Card>
  );
}
