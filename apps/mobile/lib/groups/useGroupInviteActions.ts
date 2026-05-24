import { api } from "@/lib/api";
import { invalidateGroupMutationQueries } from "./invalidation";

export function useGroupInviteActions() {
  const utils = api.useUtils();
  const inviteProfilesMutation = api.groups.inviteProfiles.useMutation({
    onSuccess: async (_data, variables) => {
      await invalidateGroupMutationQueries(utils, { groupId: variables.groupId });
    },
  });
  const acceptInviteMutation = api.groups.acceptInvite.useMutation({
    onSuccess: async () => {
      await invalidateGroupMutationQueries(utils);
    },
  });
  const declineInviteMutation = api.groups.declineInvite.useMutation({
    onSuccess: async () => {
      await invalidateGroupMutationQueries(utils);
    },
  });
  const revokeInviteMutation = api.groups.revokeInvite.useMutation({
    onSuccess: async () => {
      await invalidateGroupMutationQueries(utils);
    },
  });
  const reviewJoinRequestMutation = api.groups.reviewJoinRequest.useMutation({
    onSuccess: async () => {
      await invalidateGroupMutationQueries(utils);
    },
  });

  return {
    inviteProfiles: (input: { groupId: string; profileIds: string[] }) =>
      inviteProfilesMutation.mutateAsync(input),
    acceptInvite: (invitationId: string) => acceptInviteMutation.mutateAsync({ invitationId }),
    declineInvite: (invitationId: string) => declineInviteMutation.mutateAsync({ invitationId }),
    revokeInvite: (invitationId: string) => revokeInviteMutation.mutateAsync({ invitationId }),
    reviewJoinRequest: (input: { requestId: string; decision: "approve" | "decline" }) =>
      reviewJoinRequestMutation.mutateAsync(input),
    inviteProfilesMutation,
    acceptInviteMutation,
    declineInviteMutation,
    revokeInviteMutation,
    reviewJoinRequestMutation,
  };
}
