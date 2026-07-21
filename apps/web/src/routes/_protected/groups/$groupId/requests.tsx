import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { MutationError, QueryState } from "../../../../components/groups/group-ui";
import { api } from "../../../../lib/api/client";

export const Route = createFileRoute("/_protected/groups/$groupId/requests")({
  component: GroupRequestsPage,
});

function GroupRequestsPage() {
  const { groupId } = Route.useParams();
  const navigate = Route.useNavigate();
  const utils = api.useUtils();
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const detail = api.groups.detail.useQuery({ groupId });
  const viewer = detail.data?.viewer;
  const inviteQueue = api.groups.pendingInvitations.useQuery(
    { groupId, limit: 50 },
    { enabled: Boolean(viewer?.canInvite) },
  );
  const requestQueue = api.groups.pendingJoinRequests.useQuery(
    { groupId, limit: 50 },
    { enabled: Boolean(viewer?.canManageJoinRequests) },
  );
  const profiles = api.social.searchUsers.useQuery(
    {
      query: search.trim() || undefined,
      limit: 20,
      sort_by: search.trim() ? "username_asc" : "newest",
    },
    { enabled: Boolean(viewer?.canInvite) },
  );
  const inviteMutation = api.groups.inviteProfiles.useMutation({
    onSuccess: () => utils.groups.invalidate(),
  });
  const revokeMutation = api.groups.revokeInvite.useMutation({
    onSuccess: () => utils.groups.invalidate(),
  });
  const reviewMutation = api.groups.reviewJoinRequest.useMutation({
    onSuccess: () => utils.groups.invalidate(),
  });
  const mutationError = inviteMutation.error ?? revokeMutation.error ?? reviewMutation.error;

  return (
    <main className="container mx-auto max-w-5xl space-y-6 py-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Requests and invitations</h1>
          <p className="text-sm text-muted-foreground">
            Invite athletes and review pending access.
          </p>
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
        {viewer?.canInvite || viewer?.canManageJoinRequests ? (
          <div className="grid gap-6 lg:grid-cols-2">
            {viewer.canInvite ? (
              <section className="space-y-4 rounded-xl border p-4" aria-labelledby="invite-heading">
                <h2 className="text-xl font-semibold" id="invite-heading">
                  Invite athletes
                </h2>
                <Input
                  aria-label="Search athletes to invite"
                  placeholder="Search by username"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <QueryState
                  error={profiles.error}
                  isLoading={profiles.isLoading}
                  onRetry={() => void profiles.refetch()}
                >
                  <div className="max-h-72 space-y-2 overflow-auto">
                    {(profiles.data?.users ?? []).map((profile) => {
                      const selected = selectedIds.includes(profile.id);
                      return (
                        <button
                          aria-pressed={selected}
                          className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left ${selected ? "border-primary bg-primary/5" : ""}`}
                          key={profile.id}
                          onClick={() =>
                            setSelectedIds((current) =>
                              selected
                                ? current.filter((id) => id !== profile.id)
                                : [...current, profile.id],
                            )
                          }
                          type="button"
                        >
                          <Avatar>
                            <AvatarImage src={profile.avatar_url ?? undefined} />
                            <AvatarFallback>
                              {profile.username?.[0]?.toUpperCase() ?? "A"}
                            </AvatarFallback>
                          </Avatar>
                          <span>{profile.username ?? "Athlete"}</span>
                        </button>
                      );
                    })}
                  </div>
                </QueryState>
                <Button
                  disabled={inviteMutation.isPending || selectedIds.length === 0}
                  onClick={() =>
                    inviteMutation.mutate(
                      { groupId, profileIds: selectedIds },
                      { onSuccess: () => setSelectedIds([]) },
                    )
                  }
                  type="button"
                >
                  {inviteMutation.isPending
                    ? "Sending…"
                    : `Send ${selectedIds.length || ""} invitation${selectedIds.length === 1 ? "" : "s"}`}
                </Button>
                <h3 className="font-semibold">Pending invitations</h3>
                <QueryState
                  error={inviteQueue.error}
                  isLoading={inviteQueue.isLoading}
                  onRetry={() => void inviteQueue.refetch()}
                >
                  <div className="space-y-2">
                    {(inviteQueue.data?.items ?? []).map((invitation) => (
                      <div
                        className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 p-3"
                        key={invitation.id}
                      >
                        <span>{invitation.invited_profile.username ?? "Athlete"}</span>
                        <Button
                          disabled={revokeMutation.isPending}
                          onClick={() => revokeMutation.mutate({ invitationId: invitation.id })}
                          type="button"
                          variant="outline"
                        >
                          Revoke
                        </Button>
                      </div>
                    ))}
                  </div>
                </QueryState>
              </section>
            ) : null}
            {viewer.canManageJoinRequests ? (
              <section
                className="space-y-4 rounded-xl border p-4"
                aria-labelledby="requests-heading"
              >
                <h2 className="text-xl font-semibold" id="requests-heading">
                  Join requests
                </h2>
                <QueryState
                  error={requestQueue.error}
                  isLoading={requestQueue.isLoading}
                  onRetry={() => void requestQueue.refetch()}
                >
                  {(requestQueue.data?.items ?? []).length ? (
                    <div className="space-y-3">
                      {requestQueue.data?.items.map((request) => (
                        <div
                          className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/40 p-3"
                          key={request.id}
                        >
                          <span>{request.profile.username ?? "Athlete"}</span>
                          <div className="flex gap-2">
                            <Button
                              disabled={reviewMutation.isPending}
                              onClick={() =>
                                reviewMutation.mutate({
                                  requestId: request.id,
                                  decision: "approve",
                                })
                              }
                              type="button"
                            >
                              Approve
                            </Button>
                            <Button
                              disabled={reviewMutation.isPending}
                              onClick={() =>
                                reviewMutation.mutate({
                                  requestId: request.id,
                                  decision: "decline",
                                })
                              }
                              type="button"
                              variant="outline"
                            >
                              Decline
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No pending requests.</p>
                  )}
                </QueryState>
              </section>
            ) : null}
          </div>
        ) : (
          <p role="alert">You do not have permission to manage this group.</p>
        )}
      </QueryState>
      <MutationError error={mutationError} />
    </main>
  );
}
