import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { createFileRoute } from "@tanstack/react-router";
import { MutationError, QueryState } from "../../../../components/groups/group-ui";
import { api } from "../../../../lib/api/client";

export const Route = createFileRoute("/_protected/groups/$groupId/members")({
  component: GroupMembersPage,
});

function GroupMembersPage() {
  const { groupId } = Route.useParams();
  const navigate = Route.useNavigate();
  const utils = api.useUtils();
  const detail = api.groups.detail.useQuery({ groupId });
  const members = api.groups.members.useInfiniteQuery(
    { groupId, limit: 30 },
    {
      enabled: Boolean(detail.data?.viewer.canViewMembers),
      getNextPageParam: (page) => page.nextCursor,
    },
  );
  const roleMutation = api.groups.updateMemberRole.useMutation({
    onSuccess: () => utils.groups.invalidate(),
  });
  const removeMutation = api.groups.removeMember.useMutation({
    onSuccess: () => utils.groups.invalidate(),
  });
  const transferMutation = api.groups.transferOwnership.useMutation({
    onSuccess: () => utils.groups.invalidate(),
  });
  const mutationError = roleMutation.error ?? removeMutation.error ?? transferMutation.error;
  const viewer = detail.data?.viewer;
  const memberItems = members.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <main className="container mx-auto max-w-4xl space-y-6 py-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Group members</h1>
          <p className="text-sm text-muted-foreground">View roles and manage active membership.</p>
        </div>
        <Button
          onClick={() => void navigate({ to: "/groups/$groupId", params: { groupId } })}
          type="button"
          variant="outline"
        >
          Back to group
        </Button>
      </div>
      <QueryState
        error={detail.error}
        isLoading={detail.isLoading}
        onRetry={() => void detail.refetch()}
      >
        {viewer?.canViewMembers ? (
          <QueryState
            error={members.error}
            isLoading={members.isLoading}
            onRetry={() => void members.refetch()}
          >
            <MutationError error={mutationError} />
            <div className="space-y-3">
              {memberItems.map((member) => (
                <article
                  className="flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4"
                  key={member.profile_id}
                >
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage src={member.profile.avatar_url ?? undefined} />
                      <AvatarFallback>
                        {member.profile.username?.[0]?.toUpperCase() ?? "A"}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <button
                        className="font-semibold hover:underline"
                        onClick={() =>
                          void navigate({
                            to: "/user/$userId",
                            params: { userId: member.profile_id },
                            search: { flash: undefined, flashType: undefined },
                          })
                        }
                        type="button"
                      >
                        {member.profile.username ?? "Athlete"}
                      </button>
                      <div>
                        <Badge className="capitalize" variant="secondary">
                          {member.role}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  {viewer.canManageMembers && member.role !== "owner" ? (
                    <div className="flex flex-wrap gap-2">
                      {viewer.canPromoteMembers && member.role === "member" ? (
                        <Button
                          disabled={roleMutation.isPending}
                          onClick={() =>
                            roleMutation.mutate({
                              groupId,
                              profileId: member.profile_id,
                              role: "admin",
                            })
                          }
                          type="button"
                          variant="outline"
                        >
                          Promote to admin
                        </Button>
                      ) : null}
                      {viewer.canDemoteAdmins && member.role === "admin" ? (
                        <Button
                          disabled={roleMutation.isPending}
                          onClick={() =>
                            roleMutation.mutate({
                              groupId,
                              profileId: member.profile_id,
                              role: "member",
                            })
                          }
                          type="button"
                          variant="outline"
                        >
                          Demote to member
                        </Button>
                      ) : null}
                      {viewer.canTransferOwnership ? (
                        <Button
                          disabled={transferMutation.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Transfer ownership to ${member.profile.username ?? "this athlete"}? You will become an admin.`,
                              )
                            )
                              transferMutation.mutate({
                                groupId,
                                targetProfileId: member.profile_id,
                                previousOwnerRole: "admin",
                              });
                          }}
                          type="button"
                          variant="destructive"
                        >
                          Transfer ownership
                        </Button>
                      ) : null}
                      {viewer.canRemoveMembers ? (
                        <Button
                          disabled={removeMutation.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Remove ${member.profile.username ?? "this athlete"} from the group?`,
                              )
                            )
                              removeMutation.mutate({ groupId, profileId: member.profile_id });
                          }}
                          type="button"
                          variant="destructive"
                        >
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
            {members.hasNextPage ? (
              <Button
                disabled={members.isFetchingNextPage}
                onClick={() => void members.fetchNextPage()}
                type="button"
                variant="outline"
              >
                {members.isFetchingNextPage ? "Loading…" : "Load more members"}
              </Button>
            ) : null}
          </QueryState>
        ) : (
          <p role="alert">You do not have permission to view this member list.</p>
        )}
      </QueryState>
    </main>
  );
}
