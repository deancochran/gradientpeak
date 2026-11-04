type DeleteActivityPlanRepository = {
  deleteOwnedPlanIfUnlinked(input: {
    planId: string;
    profileId: string;
  }): Promise<"deleted" | "linked_events" | "not_found">;
};

export class ActivityPlanDeleteNotFoundError extends Error {}

export class ActivityPlanLinkedEventsError extends Error {}

export async function deleteActivityPlanUseCase(input: {
  planId: string;
  profileId: string;
  repository: DeleteActivityPlanRepository;
}) {
  const result = await input.repository.deleteOwnedPlanIfUnlinked({
    planId: input.planId,
    profileId: input.profileId,
  });

  if (result === "not_found") throw new ActivityPlanDeleteNotFoundError();
  if (result === "linked_events") throw new ActivityPlanLinkedEventsError();

  return { success: true, plannedActivitySync: null } as const;
}
