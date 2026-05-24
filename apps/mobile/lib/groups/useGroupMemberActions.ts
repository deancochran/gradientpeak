import type { GroupMembershipRole } from "@repo/core/groups";
import { api } from "@/lib/api";
import { invalidateGroupMutationQueries } from "./invalidation";

export function useGroupMemberActions() {
  const utils = api.useUtils();
  const updateRoleMutation = api.groups.updateMemberRole.useMutation({
    onSuccess: async (_data, variables) => {
      await invalidateGroupMutationQueries(utils, { groupId: variables.groupId });
    },
  });
  const removeMutation = api.groups.removeMember.useMutation({
    onSuccess: async (_data, variables) => {
      await invalidateGroupMutationQueries(utils, { groupId: variables.groupId });
    },
  });
  const transferOwnershipMutation = api.groups.transferOwnership.useMutation({
    onSuccess: async (_data, variables) => {
      await invalidateGroupMutationQueries(utils, { groupId: variables.groupId });
    },
  });

  return {
    updateMemberRole: (input: {
      groupId: string;
      profileId: string;
      role: Exclude<GroupMembershipRole, "owner">;
    }) => updateRoleMutation.mutateAsync(input),
    removeMember: (input: { groupId: string; profileId: string }) =>
      removeMutation.mutateAsync(input),
    transferOwnership: (input: {
      groupId: string;
      targetProfileId: string;
      previousOwnerRole: Exclude<GroupMembershipRole, "owner">;
    }) => transferOwnershipMutation.mutateAsync(input),
    updateRoleMutation,
    removeMutation,
    transferOwnershipMutation,
  };
}
