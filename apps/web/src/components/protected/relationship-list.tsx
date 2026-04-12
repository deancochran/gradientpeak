import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
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
  hasMore,
  isFetching,
  isLoading,
  onLoadMore,
  onOpenProfile,
  title,
  total,
  users,
}: {
  action?: (profile: RelationshipProfile) => React.ReactNode;
  emptyMessage: string;
  hasMore: boolean;
  isFetching: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
  onOpenProfile: (userId: string) => void;
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
                <button
                  className="flex flex-1 items-center gap-3 text-left"
                  onClick={() => onOpenProfile(profile.id)}
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
                </button>

                {action ? action(profile) : null}
              </div>
            ))}
          </div>
        )}

        {hasMore ? (
          <div className="mt-4 text-center">
            <Button variant="outline" onClick={onLoadMore} disabled={isFetching}>
              {isFetching ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                "Load more"
              )}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
