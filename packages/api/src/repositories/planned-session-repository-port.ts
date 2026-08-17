import type { ActivityPlanStructure } from "@repo/core/activity-plan";
import type { PlannedSession } from "@repo/core/calendar";
import type {
  PlannedSessionMutation,
  PlannedSessionMutationResult,
} from "../contracts/planned-sessions";

export type CreateOwnedPlannedSessionResult =
  | { status: "created"; session: PlannedSession }
  | { status: "unchanged"; session: PlannedSession }
  | { status: "access_denied"; reason: "group_event_unavailable" }
  | { status: "identity_conflict" }
  | { status: "conflict"; reason: "group_event_already_linked" };

/** Explicit application shape for building a prescription without exposing a database row. */
export type ActivityPlanPrescriptionSource = {
  id: string;
  profileId: string | null;
  name: string;
  description: string | null;
  revision: number;
  structure: ActivityPlanStructure;
  structureHash: string;
  gpsRecordingEnabled: boolean;
  updatedAt: string;
};

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
  /** `updated` also covers an exact lost-response replay whose requested state is already applied. */
  mutateOwned(input: PlannedSessionMutation): Promise<PlannedSessionMutationResult>;
  trainingPlanExistsForProfile(input: {
    profileId: string;
    trainingPlanId: string;
  }): Promise<boolean>;
  activityPlanExistsForProfile(input: {
    profileId: string;
    activityPlanId: string;
  }): Promise<boolean>;
  getActivityPlanPrescriptionSource(input: {
    profileId: string;
    activityPlanId: string;
  }): Promise<ActivityPlanPrescriptionSource | null>;
  groupEventExistsForProfile(input: { profileId: string; groupEventId: string }): Promise<boolean>;
}
