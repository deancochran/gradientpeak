import type { PlannedSession } from "@repo/core/calendar";
import type {
  PlannedSessionMutation,
  PlannedSessionMutationResult,
} from "../contracts/planned-sessions";

export type CreateOwnedPlannedSessionResult =
  | { status: "created"; session: PlannedSession }
  | { status: "unchanged"; session: PlannedSession }
  | { status: "identity_conflict" }
  | { status: "conflict"; reason: "group_event_already_linked" };

/** Owner-scoped persistence for the future scheduled-work authority. */
export interface PlannedSessionRepositoryPort {
  createOwned(input: {
    profileId: string;
    session: PlannedSession;
  }): Promise<CreateOwnedPlannedSessionResult>;
  listOwnedRange(input: {
    profileId: string;
    startDate: string;
    endDate: string;
    limit: number;
  }): Promise<{ items: PlannedSession[]; truncated: boolean }>;
  getOwned(input: { profileId: string; sessionId: string }): Promise<PlannedSession | null>;
  listOwnedLinkedToActivity(input: {
    profileId: string;
    activityId: string;
  }): Promise<PlannedSession[]>;
  mutateOwned(input: PlannedSessionMutation): Promise<PlannedSessionMutationResult>;
  trainingPlanExistsForProfile(input: {
    profileId: string;
    trainingPlanId: string;
  }): Promise<boolean>;
  activityPlanExistsForProfile(input: {
    profileId: string;
    activityPlanId: string;
  }): Promise<boolean>;
  groupEventExistsForProfile(input: { profileId: string; groupEventId: string }): Promise<boolean>;
}
