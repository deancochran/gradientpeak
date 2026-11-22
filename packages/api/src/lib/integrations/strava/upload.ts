import { createCompletedActivityExportExternalId } from "../../provider-sync/completed-activity-export/external-id";

/** Opaque deterministic identity binding owner, activity revision, and provider destination. */
export function createStravaCompletedActivityExternalId(input: {
  activityId: string;
  artifactRevision: string;
  destination: string;
  profileId: string;
  secret: string;
}): string {
  return createCompletedActivityExportExternalId({
    activityId: input.activityId,
    artifactDigest: input.artifactRevision,
    profileId: input.profileId,
    provider: input.destination,
    secret: input.secret,
  });
}
