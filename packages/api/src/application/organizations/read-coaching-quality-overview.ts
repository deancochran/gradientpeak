import type { DrizzleQueryExecutor } from "../../db";
import { createOrganizationCoachingQualityRepository } from "../../repositories/organization-coaching-quality-repository";

export class CoachingQualityOverviewAccessError extends Error {}

const definitions = {
  activeEngagements:
    "Current, unpaused engagements within the actor's authorized assignment scope.",
  activeWithoutPrimary:
    "Active in-scope engagements with no current primary direct coaching assignment; supporting assignments do not satisfy this count.",
  pausedEngagements: "Current, paused engagements within the actor's authorized assignment scope.",
  snapshotAsOf:
    "Observation timestamp for this read, not a scheduled lifecycle effective-time promise. Any non-null terminal marker is current and denies or excludes immediately.",
  version: "coaching-quality-overview.v1",
} as const;

export async function readCoachingQualityOverview(input: {
  db: DrizzleQueryExecutor;
  organizationId: string;
  actorProfileId: string;
}) {
  const overview = await createOrganizationCoachingQualityRepository(input.db).readOverview(input);
  if (!overview) throw new CoachingQualityOverviewAccessError();
  return {
    actorProfileId: input.actorProfileId,
    organizationId: input.organizationId,
    scopeKind: overview.scope_kind,
    scopeExplanation:
      overview.scope_kind === "organization_admin"
        ? "Organization administrators can view organization-wide engagement aggregates."
        : "This aggregate includes only engagements currently assigned directly to you or through your active groups.",
    snapshotAsOf: overview.snapshot_as_of,
    definitions,
    aggregates: {
      activeEngagementCount: overview.active_engagement_count,
      pausedEngagementCount: overview.paused_engagement_count,
      activeWithoutPrimaryCount: overview.active_without_primary_count,
    },
  };
}
