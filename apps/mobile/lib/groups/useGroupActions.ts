import type { CreateGroupInput, UpdateGroupInput } from "@repo/core/groups";
import { api } from "@/lib/api";
import { invalidateGroupMutationQueries } from "./invalidation";

export function useGroupActions() {
  const utils = api.useUtils();
  const createMutation = api.groups.create.useMutation({
    onSuccess: async (data) => {
      await invalidateGroupMutationQueries(utils, {
        groupId: data.group.id,
        slug: data.group.slug,
      });
    },
  });
  const updateMutation = api.groups.update.useMutation({
    onSuccess: async (data) => {
      await invalidateGroupMutationQueries(utils, {
        groupId: data.group.id,
        slug: data.group.slug,
      });
    },
  });
  const deleteMutation = api.groups.delete.useMutation({
    onSuccess: async (_data, variables) => {
      await invalidateGroupMutationQueries(utils, { groupId: variables.groupId });
    },
  });
  const joinMutation = api.groups.join.useMutation({
    onSuccess: async (_data, variables) => {
      await invalidateGroupMutationQueries(utils, { groupId: variables.groupId });
    },
  });
  const leaveMutation = api.groups.leave.useMutation({
    onSuccess: async (_data, variables) => {
      await invalidateGroupMutationQueries(utils, { groupId: variables.groupId });
    },
  });
  const requestToJoinMutation = api.groups.requestToJoin.useMutation({
    onSuccess: async (_data, variables) => {
      await invalidateGroupMutationQueries(utils, { groupId: variables.groupId });
    },
  });
  const cancelJoinRequestMutation = api.groups.cancelJoinRequest.useMutation({
    onSuccess: async () => {
      await invalidateGroupMutationQueries(utils);
    },
  });

  return {
    createGroup: (input: CreateGroupInput) => createMutation.mutateAsync(input),
    updateGroup: (input: UpdateGroupInput) => updateMutation.mutateAsync(input),
    deleteGroup: (groupId: string) => deleteMutation.mutateAsync({ groupId }),
    joinGroup: (groupId: string) => joinMutation.mutateAsync({ groupId }),
    leaveGroup: (groupId: string) => leaveMutation.mutateAsync({ groupId }),
    requestToJoin: (groupId: string) => requestToJoinMutation.mutateAsync({ groupId }),
    cancelJoinRequest: (requestId: string) => cancelJoinRequestMutation.mutateAsync({ requestId }),
    createMutation,
    updateMutation,
    deleteMutation,
    joinMutation,
    leaveMutation,
    requestToJoinMutation,
    cancelJoinRequestMutation,
  };
}
