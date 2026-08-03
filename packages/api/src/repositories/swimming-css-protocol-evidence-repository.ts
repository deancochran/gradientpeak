import { SWIMMING_CSS_SOURCE_EFFORT_METHOD } from "@repo/core";
import {
  activities,
  activityArtifactLinks,
  activityArtifacts,
  activityEfforts,
  activitySegments,
  swimmingCssProtocolEvidence,
} from "@repo/db";
import { and, eq, inArray } from "drizzle-orm";
import type { getRequiredDb } from "../db";

type DbClient = ReturnType<typeof getRequiredDb>;
type TransactionClient = Parameters<Parameters<DbClient["transaction"]>[0]>[0];

export type SwimmingCssProtocolEvidenceTransaction = Pick<
  TransactionClient,
  "delete" | "insert" | "select" | "update"
>;

export type SwimmingCssProtocolSourceActivity = Pick<
  typeof activities.$inferSelect,
  "id" | "profile_id" | "pool_length_meters" | "segments_revision"
>;

export type SwimmingCssProtocolSourceArtifact = Pick<
  typeof activityArtifactLinks.$inferSelect,
  "artifact_id" | "is_current" | "profile_id" | "role"
> &
  Pick<typeof activityArtifacts.$inferSelect, "availability" | "digest">;

export type SwimmingCssProtocolSourceEffort = Pick<
  typeof activityEfforts.$inferSelect,
  | "activity_category"
  | "activity_id"
  | "calculation_version"
  | "distance_meters"
  | "duration_seconds"
  | "effort_type"
  | "id"
  | "method"
  | "profile_id"
  | "provenance"
  | "recorded_at"
  | "segment_id"
  | "source"
  | "unit"
  | "value"
> & {
  segment_activity_category: string | null;
  segment_active_ms: number | null;
  segment_end_offset_ms: number;
  segment_ordinal: number;
  segment_profile_id: string;
  segment_revision: number;
  segment_role: string;
  segment_source_artifact_id: string | null;
  segment_start_offset_ms: number;
  segment_summary: unknown;
  segment_timing_coverage: string;
};

export type SwimmingCssProtocolSourceSnapshot = Readonly<{
  activity: SwimmingCssProtocolSourceActivity | null;
  currentArtifact: SwimmingCssProtocolSourceArtifact | null;
  efforts: readonly SwimmingCssProtocolSourceEffort[];
  existingEvidence: typeof swimmingCssProtocolEvidence.$inferSelect | null;
}>;

export async function readSwimmingCssProtocolSourceSnapshot(
  tx: SwimmingCssProtocolEvidenceTransaction,
  input: { activityId: string; profileId: string },
): Promise<SwimmingCssProtocolSourceSnapshot> {
  const activityRows = await tx
    .select({
      id: activities.id,
      profile_id: activities.profile_id,
      pool_length_meters: activities.pool_length_meters,
      segments_revision: activities.segments_revision,
    })
    .from(activities)
    .where(and(eq(activities.id, input.activityId), eq(activities.profile_id, input.profileId)))
    .limit(1);
  const artifactRows = await tx
    .select({
      artifact_id: activityArtifactLinks.artifact_id,
      profile_id: activityArtifactLinks.profile_id,
      role: activityArtifactLinks.role,
      is_current: activityArtifactLinks.is_current,
      availability: activityArtifacts.availability,
      digest: activityArtifacts.digest,
    })
    .from(activityArtifactLinks)
    .innerJoin(
      activityArtifacts,
      and(
        eq(activityArtifacts.id, activityArtifactLinks.artifact_id),
        eq(activityArtifacts.profile_id, activityArtifactLinks.profile_id),
      ),
    )
    .where(
      and(
        eq(activityArtifactLinks.activity_id, input.activityId),
        eq(activityArtifactLinks.profile_id, input.profileId),
        eq(activityArtifactLinks.role, "source"),
        eq(activityArtifactLinks.is_current, true),
      ),
    )
    .limit(1);
  const efforts = await tx
    .select({
      id: activityEfforts.id,
      profile_id: activityEfforts.profile_id,
      activity_id: activityEfforts.activity_id,
      segment_id: activityEfforts.segment_id,
      recorded_at: activityEfforts.recorded_at,
      activity_category: activityEfforts.activity_category,
      effort_type: activityEfforts.effort_type,
      duration_seconds: activityEfforts.duration_seconds,
      distance_meters: activityEfforts.distance_meters,
      unit: activityEfforts.unit,
      value: activityEfforts.value,
      source: activityEfforts.source,
      method: activityEfforts.method,
      calculation_version: activityEfforts.calculation_version,
      provenance: activityEfforts.provenance,
      segment_profile_id: activitySegments.profile_id,
      segment_role: activitySegments.role,
      segment_activity_category: activitySegments.activity_category,
      segment_start_offset_ms: activitySegments.start_offset_ms,
      segment_end_offset_ms: activitySegments.end_offset_ms,
      segment_ordinal: activitySegments.ordinal,
      segment_source_artifact_id: activitySegments.source_artifact_id,
      segment_summary: activitySegments.summary,
      segment_timing_coverage: activitySegments.timing_coverage,
      segment_active_ms: activitySegments.active_ms,
      segment_revision: activitySegments.segment_revision,
    })
    .from(activityEfforts)
    .innerJoin(
      activitySegments,
      and(
        eq(activitySegments.id, activityEfforts.segment_id),
        eq(activitySegments.activity_id, activityEfforts.activity_id),
        eq(activitySegments.profile_id, activityEfforts.profile_id),
        eq(activitySegments.activity_category, activityEfforts.activity_category),
      ),
    )
    .where(
      and(
        eq(activityEfforts.activity_id, input.activityId),
        eq(activityEfforts.profile_id, input.profileId),
        eq(activityEfforts.source, "imported"),
        eq(activityEfforts.method, SWIMMING_CSS_SOURCE_EFFORT_METHOD),
        inArray(activityEfforts.distance_meters, [200, 400]),
      ),
    );
  const existingRows = await tx
    .select()
    .from(swimmingCssProtocolEvidence)
    .where(
      and(
        eq(swimmingCssProtocolEvidence.activity_id, input.activityId),
        eq(swimmingCssProtocolEvidence.profile_id, input.profileId),
      ),
    )
    .limit(1);

  return Object.freeze({
    activity: activityRows[0] ?? null,
    currentArtifact: artifactRows[0] ?? null,
    efforts: Object.freeze(efforts),
    existingEvidence: existingRows[0] ?? null,
  });
}

export async function deleteSwimmingCssProtocolEvidenceForActivity(
  tx: SwimmingCssProtocolEvidenceTransaction,
  input: { activityId: string; profileId: string },
): Promise<void> {
  await tx
    .delete(swimmingCssProtocolEvidence)
    .where(
      and(
        eq(swimmingCssProtocolEvidence.activity_id, input.activityId),
        eq(swimmingCssProtocolEvidence.profile_id, input.profileId),
      ),
    );
}

export async function upsertSwimmingCssProtocolEvidence(
  tx: SwimmingCssProtocolEvidenceTransaction,
  values: typeof swimmingCssProtocolEvidence.$inferInsert,
): Promise<typeof swimmingCssProtocolEvidence.$inferSelect> {
  const [row] = await tx
    .insert(swimmingCssProtocolEvidence)
    .values(values)
    .onConflictDoUpdate({
      target: [
        swimmingCssProtocolEvidence.profile_id,
        swimmingCssProtocolEvidence.activity_id,
        swimmingCssProtocolEvidence.protocol,
      ],
      set: {
        protocol_id: values.protocol_id,
        evidence_id: values.evidence_id,
        evidence_revision: values.evidence_revision,
        source_artifact_id: values.source_artifact_id,
        source_artifact_digest: values.source_artifact_digest,
        observed_at: values.observed_at,
        environment: values.environment,
        pool_length_meters: values.pool_length_meters,
        timing_basis: values.timing_basis,
        status: values.status,
        reasons: values.reasons,
        effort_400_id: values.effort_400_id,
        effort_400_evidence_revision: values.effort_400_evidence_revision,
        effort_400_segment_id: values.effort_400_segment_id,
        effort_400_observed_at: values.effort_400_observed_at,
        effort_400_duration_seconds: values.effort_400_duration_seconds,
        effort_400_start_offset_ms: values.effort_400_start_offset_ms,
        effort_400_end_offset_ms: values.effort_400_end_offset_ms,
        effort_200_id: values.effort_200_id,
        effort_200_evidence_revision: values.effort_200_evidence_revision,
        effort_200_segment_id: values.effort_200_segment_id,
        effort_200_observed_at: values.effort_200_observed_at,
        effort_200_duration_seconds: values.effort_200_duration_seconds,
        effort_200_start_offset_ms: values.effort_200_start_offset_ms,
        effort_200_end_offset_ms: values.effort_200_end_offset_ms,
        calculation_version: values.calculation_version,
        updated_at: values.updated_at,
      },
    })
    .returning();
  if (!row) throw new Error("Failed to persist canonical CSS protocol evidence");
  return row;
}
