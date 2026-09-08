import { decideRemoteSourceCanonicalAction, type PersistentIntegrationSourceId } from "@repo/core";
import { activityArtifactLinks, activityArtifacts, activitySourceReferences } from "@repo/db";
import { and, asc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import type { DrizzleTransactionClient } from "../db";

export type ActivitySourceIdentity = {
  profileId: string;
  integrationId: string;
  provider: string;
  providerExternalId: string;
  providerRevision?: string | null;
  originProvider?: string | null;
  originExternalId?: string | null;
  originTrust?: "trusted_provider_origin";
  artifactSha256?: string | null;
  importRunId?: string | null;
  relationshipKind?: "imported" | "exported" | "both";
};

export type ActivitySourceResolutionStatus =
  | "confirmed"
  | "review"
  | "ignored"
  | "provider_deleted";

export class ActivitySourceInactiveError extends Error {
  constructor(public readonly status: Exclude<ActivitySourceResolutionStatus, "confirmed">) {
    super(`Activity source is ${status}`);
    this.name = ActivitySourceInactiveError.name;
  }
}

const canonicalResolutionStatuses: ActivitySourceResolutionStatus[] = ["confirmed"];

export async function listActivitySourceReferencesForActivity(
  tx: DrizzleTransactionClient,
  input: { activityId: string; profileId: string },
) {
  return tx
    .select({
      id: activitySourceReferences.id,
      provider: activitySourceReferences.provider,
      resolutionStatus: activitySourceReferences.resolution_status,
    })
    .from(activitySourceReferences)
    .where(
      and(
        eq(activitySourceReferences.activity_id, input.activityId),
        eq(activitySourceReferences.profile_id, input.profileId),
        inArray(activitySourceReferences.resolution_status, ["confirmed", "review"]),
      ),
    )
    .orderBy(asc(activitySourceReferences.provider), asc(activitySourceReferences.id));
}

function trustedOrigin(source: ActivitySourceIdentity) {
  const hasProvider = source.originProvider !== undefined && source.originProvider !== null;
  const hasExternalId = source.originExternalId !== undefined && source.originExternalId !== null;
  const hasTrust = source.originTrust !== undefined;
  if (!hasProvider && !hasExternalId && !hasTrust) return null;
  if (!hasProvider || !hasExternalId || source.originTrust !== "trusted_provider_origin") {
    throw new Error("Activity origin identity requires explicit trusted provenance");
  }
  return {
    provider: source.originProvider as string,
    externalId: source.originExternalId as string,
  };
}

export async function lockActivitySourceResolution(
  tx: DrizzleTransactionClient,
  profileId: string,
) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${profileId}, 0))`);
}

export type RemoteActivitySourceDeletionResult =
  | { status: "not_found" }
  | { status: "stale_event"; activityId: string | null }
  | { status: "retained_user_tombstone" }
  | { status: "already_deleted" }
  | { status: "source_deactivated"; activityId: null }
  | {
      status: "canonical_deleted" | "canonical_retained";
      activityId: string;
      support: {
        hasAcceptedArtifactEvidence: boolean;
        hasOtherConfirmedSource: boolean;
      };
    };

/**
 * Applies provider deletion without provider-specific branches. The supplied canonical deletion
 * operation must perform the owning activity's complete transactional cleanup with this profile
 * lock already held.
 */
export async function deleteRemoteActivitySourceWithCanonicalCleanup(
  tx: DrizzleTransactionClient,
  input: {
    integrationId: string;
    now?: Date;
    profileId: string;
    provider: PersistentIntegrationSourceId;
    providerExternalId: string;
    providerRevision?: string | null;
  },
  deleteCanonicalActivity: (input: { activityId: string; profileId: string }) => Promise<void>,
): Promise<RemoteActivitySourceDeletionResult> {
  await lockActivitySourceResolution(tx, input.profileId);
  const [source] = await tx
    .select({
      activityId: activitySourceReferences.activity_id,
      id: activitySourceReferences.id,
      providerRevision: activitySourceReferences.provider_revision,
      relationshipKind: activitySourceReferences.relationship_kind,
      resolutionStatus: activitySourceReferences.resolution_status,
    })
    .from(activitySourceReferences)
    .where(
      and(
        eq(activitySourceReferences.integration_id, input.integrationId),
        eq(activitySourceReferences.profile_id, input.profileId),
        eq(activitySourceReferences.provider, input.provider),
        eq(activitySourceReferences.provider_external_id, input.providerExternalId),
      ),
    )
    .limit(1)
    .for("update");
  if (!source) {
    const [tombstone] = await tx
      .insert(activitySourceReferences)
      .values({
        activity_id: null,
        integration_id: input.integrationId,
        profile_id: input.profileId,
        provider: input.provider,
        provider_external_id: input.providerExternalId,
        provider_revision: input.providerRevision,
        resolution_status: "provider_deleted",
        updated_at: input.now ?? new Date(),
      })
      .onConflictDoNothing()
      .returning({ id: activitySourceReferences.id });
    if (!tombstone) throw new Error("Provider deletion tombstone could not be persisted");
    return { status: "source_deactivated", activityId: null };
  }
  if (input.providerRevision && source.resolutionStatus !== "provider_deleted") {
    const persistedAt = source.providerRevision ? Date.parse(source.providerRevision) : Number.NaN;
    const incomingAt = Date.parse(input.providerRevision);
    if (Number.isFinite(persistedAt) && Number.isFinite(incomingAt) && incomingAt < persistedAt) {
      return { status: "stale_event", activityId: source.activityId };
    }
  }
  if (source.resolutionStatus === "ignored") return { status: "retained_user_tombstone" };
  if (source.resolutionStatus === "provider_deleted") return { status: "already_deleted" };

  const [deactivated] = await tx
    .update(activitySourceReferences)
    .set({
      activity_id: null,
      provider_revision: input.providerRevision,
      resolution_status: "provider_deleted",
      updated_at: input.now ?? new Date(),
    })
    .where(
      and(
        eq(activitySourceReferences.id, source.id),
        eq(activitySourceReferences.profile_id, input.profileId),
        inArray(activitySourceReferences.resolution_status, ["confirmed", "review"]),
      ),
    )
    .returning({ id: activitySourceReferences.id });
  if (!deactivated) throw new Error("Activity source changed during provider deletion");
  if (!source.activityId) return { status: "source_deactivated", activityId: null };

  const [otherSource] = await tx
    .select({ id: activitySourceReferences.id })
    .from(activitySourceReferences)
    .where(
      and(
        eq(activitySourceReferences.activity_id, source.activityId),
        eq(activitySourceReferences.profile_id, input.profileId),
        eq(activitySourceReferences.resolution_status, "confirmed"),
        ne(activitySourceReferences.id, source.id),
      ),
    )
    .limit(1);
  const [acceptedArtifact] = await tx
    .select({ id: activityArtifactLinks.id })
    .from(activityArtifactLinks)
    .innerJoin(activityArtifacts, eq(activityArtifacts.id, activityArtifactLinks.artifact_id))
    .where(
      and(
        eq(activityArtifactLinks.activity_id, source.activityId),
        eq(activityArtifactLinks.profile_id, input.profileId),
        eq(activityArtifactLinks.role, "source"),
        eq(activityArtifactLinks.is_current, true),
        eq(activityArtifacts.availability, "accepted"),
      ),
    )
    .limit(1);
  const support = {
    hasAcceptedArtifactEvidence: Boolean(acceptedArtifact),
    hasOtherConfirmedSource: Boolean(otherSource),
  };
  if (source.relationshipKind === "exported" || source.relationshipKind === "both") {
    return { status: "canonical_retained", activityId: source.activityId, support };
  }
  if (decideRemoteSourceCanonicalAction(support) === "retain") {
    return { status: "canonical_retained", activityId: source.activityId, support };
  }

  await deleteCanonicalActivity({ activityId: source.activityId, profileId: input.profileId });
  return { status: "canonical_deleted", activityId: source.activityId, support };
}

export async function resolveCanonicalActivityReference(
  tx: DrizzleTransactionClient,
  source: ActivitySourceIdentity,
) {
  const origin = trustedOrigin(source);
  const [direct] = await tx
    .select({
      activityId: activitySourceReferences.activity_id,
      resolutionStatus: activitySourceReferences.resolution_status,
    })
    .from(activitySourceReferences)
    .where(
      and(
        eq(activitySourceReferences.profile_id, source.profileId),
        eq(activitySourceReferences.provider, source.provider),
        eq(activitySourceReferences.provider_external_id, source.providerExternalId),
      ),
    )
    .limit(1);
  if (direct) {
    if (direct.resolutionStatus !== "confirmed") {
      throw new ActivitySourceInactiveError(
        direct.resolutionStatus as Exclude<ActivitySourceResolutionStatus, "confirmed">,
      );
    }
    if (!direct.activityId) throw new Error("Confirmed activity source has no canonical activity");
    return direct.activityId;
  }

  if (origin) {
    const [originReference] = await tx
      .select({ activityId: activitySourceReferences.activity_id })
      .from(activitySourceReferences)
      .where(
        and(
          eq(activitySourceReferences.profile_id, source.profileId),
          eq(activitySourceReferences.origin_provider, origin.provider),
          eq(activitySourceReferences.origin_external_id, origin.externalId),
          inArray(activitySourceReferences.resolution_status, canonicalResolutionStatuses),
          isNotNull(activitySourceReferences.activity_id),
        ),
      )
      .limit(1);
    if (originReference) return originReference.activityId;
  }

  if (source.artifactSha256) {
    const [artifact] = await tx
      .select({ activityId: activitySourceReferences.activity_id })
      .from(activitySourceReferences)
      .where(
        and(
          eq(activitySourceReferences.profile_id, source.profileId),
          eq(activitySourceReferences.artifact_sha256, source.artifactSha256),
          inArray(activitySourceReferences.resolution_status, canonicalResolutionStatuses),
          isNotNull(activitySourceReferences.activity_id),
        ),
      )
      .limit(1);
    if (artifact) return artifact.activityId;
  }
  return null;
}

export async function attachActivitySourceReference(
  tx: DrizzleTransactionClient,
  input: ActivitySourceIdentity & { activityId: string; now?: Date },
) {
  await lockActivitySourceResolution(tx, input.profileId);
  return attachActivitySourceReferenceWithProfileLockHeld(tx, input);
}

/**
 * Persists a provider identity without creating a second canonical activity while an owner decides
 * whether the import belongs to an existing activity. Existing confirmed or suppressed decisions
 * remain authoritative and are never reactivated by another provider delivery.
 */
export async function stageActivitySourceReferenceForReview(
  tx: DrizzleTransactionClient,
  input: ActivitySourceIdentity & { candidateActivityId?: string | null; now?: Date },
) {
  await lockActivitySourceResolution(tx, input.profileId);
  const now = input.now ?? new Date();
  const origin = trustedOrigin(input);
  const [inserted] = await tx
    .insert(activitySourceReferences)
    .values({
      profile_id: input.profileId,
      activity_id: input.candidateActivityId ?? null,
      resolution_status: "review",
      integration_id: input.integrationId,
      provider: input.provider,
      provider_external_id: input.providerExternalId,
      provider_revision: input.providerRevision,
      origin_provider: origin?.provider ?? null,
      origin_external_id: origin?.externalId ?? null,
      artifact_sha256: input.artifactSha256,
      last_import_run_id: input.importRunId,
      relationship_kind: input.relationshipKind ?? "imported",
      created_at: now,
      updated_at: now,
    })
    .onConflictDoNothing()
    .returning({
      activityId: activitySourceReferences.activity_id,
      resolutionStatus: activitySourceReferences.resolution_status,
    });
  if (inserted) return { ...inserted, inserted: true };

  const [existing] = await tx
    .select({
      activityId: activitySourceReferences.activity_id,
      resolutionStatus: activitySourceReferences.resolution_status,
    })
    .from(activitySourceReferences)
    .where(
      and(
        eq(activitySourceReferences.profile_id, input.profileId),
        eq(activitySourceReferences.provider, input.provider),
        eq(activitySourceReferences.provider_external_id, input.providerExternalId),
      ),
    )
    .limit(1);
  if (!existing) throw new Error("Activity source review state could not be persisted");
  return { ...existing, inserted: false };
}

export async function attachActivitySourceReferenceWithProfileLockHeld(
  tx: DrizzleTransactionClient,
  input: ActivitySourceIdentity & { activityId: string; now?: Date },
) {
  const now = input.now ?? new Date();
  const origin = trustedOrigin(input);
  const [inserted] = await tx
    .insert(activitySourceReferences)
    .values({
      profile_id: input.profileId,
      activity_id: input.activityId,
      integration_id: input.integrationId,
      provider: input.provider,
      provider_external_id: input.providerExternalId,
      provider_revision: input.providerRevision,
      origin_provider: origin?.provider ?? null,
      origin_external_id: origin?.externalId ?? null,
      artifact_sha256: input.artifactSha256,
      last_import_run_id: input.importRunId,
      relationship_kind: input.relationshipKind ?? "imported",
      created_at: now,
      updated_at: now,
    })
    .onConflictDoNothing()
    .returning({ activityId: activitySourceReferences.activity_id });
  if (inserted) return { activityId: inserted.activityId, inserted: true };

  const [direct] = await tx
    .select({
      activityId: activitySourceReferences.activity_id,
      artifactSha256: activitySourceReferences.artifact_sha256,
      originProvider: activitySourceReferences.origin_provider,
      originExternalId: activitySourceReferences.origin_external_id,
      resolutionStatus: activitySourceReferences.resolution_status,
      relationshipKind: activitySourceReferences.relationship_kind,
    })
    .from(activitySourceReferences)
    .where(
      and(
        eq(activitySourceReferences.profile_id, input.profileId),
        eq(activitySourceReferences.provider, input.provider),
        eq(activitySourceReferences.provider_external_id, input.providerExternalId),
      ),
    )
    .limit(1);
  if (direct) {
    if (direct.resolutionStatus !== "confirmed") {
      throw new ActivitySourceInactiveError(
        direct.resolutionStatus as Exclude<ActivitySourceResolutionStatus, "confirmed">,
      );
    }
    if (!direct.activityId) throw new Error("Confirmed activity source has no canonical activity");
    if (direct.activityId !== input.activityId)
      return { activityId: direct.activityId, inserted: false };
    if (
      origin &&
      ((direct.originProvider !== null && direct.originProvider !== origin.provider) ||
        (direct.originExternalId !== null && direct.originExternalId !== origin.externalId))
    )
      throw new Error("Activity source trusted origin conflicts with its persisted identity");
    let canAttachOrigin = origin !== null && direct.originProvider === null;
    if (canAttachOrigin && origin) {
      const [originOwner] = await tx
        .select({ activityId: activitySourceReferences.activity_id })
        .from(activitySourceReferences)
        .where(
          and(
            eq(activitySourceReferences.profile_id, input.profileId),
            eq(activitySourceReferences.origin_provider, origin.provider),
            eq(activitySourceReferences.origin_external_id, origin.externalId),
          ),
        )
        .limit(1);
      if (originOwner && originOwner.activityId !== direct.activityId)
        throw new Error("Activity source trusted origin belongs to another canonical activity");
      if (originOwner) canAttachOrigin = false;
    }
    let canAttachArtifact = Boolean(input.artifactSha256 && direct.artifactSha256 === null);
    if (canAttachArtifact && input.artifactSha256) {
      const [artifactOwner] = await tx
        .select({ activityId: activitySourceReferences.activity_id })
        .from(activitySourceReferences)
        .where(
          and(
            eq(activitySourceReferences.profile_id, input.profileId),
            eq(activitySourceReferences.artifact_sha256, input.artifactSha256),
          ),
        )
        .limit(1);
      if (artifactOwner && artifactOwner.activityId !== direct.activityId)
        throw new Error("Activity source artifact belongs to another canonical activity");
      if (artifactOwner) canAttachArtifact = false;
    }
    await tx
      .update(activitySourceReferences)
      .set({
        provider_revision: input.providerRevision,
        last_import_run_id: input.importRunId,
        origin_provider:
          direct.originProvider ?? (canAttachOrigin && origin ? origin.provider : undefined),
        origin_external_id:
          direct.originExternalId ?? (canAttachOrigin && origin ? origin.externalId : undefined),
        artifact_sha256:
          direct.artifactSha256 ?? (canAttachArtifact ? input.artifactSha256 : undefined),
        relationship_kind:
          direct.relationshipKind === input.relationshipKind || input.relationshipKind === undefined
            ? direct.relationshipKind
            : "both",
        updated_at: now,
      })
      .where(
        and(
          eq(activitySourceReferences.profile_id, input.profileId),
          eq(activitySourceReferences.provider, input.provider),
          eq(activitySourceReferences.provider_external_id, input.providerExternalId),
          inArray(activitySourceReferences.resolution_status, canonicalResolutionStatuses),
          isNotNull(activitySourceReferences.activity_id),
        ),
      );
    return { activityId: direct.activityId, inserted: false };
  }

  const winner = await resolveCanonicalActivityReference(tx, input);
  if (!winner) throw new Error("Activity source reference conflict could not be resolved");
  if (winner !== input.activityId) return { activityId: winner, inserted: false };

  const [directOnly] = await tx
    .insert(activitySourceReferences)
    .values({
      profile_id: input.profileId,
      activity_id: winner,
      integration_id: input.integrationId,
      provider: input.provider,
      provider_external_id: input.providerExternalId,
      provider_revision: input.providerRevision,
      origin_provider: null,
      origin_external_id: null,
      artifact_sha256: null,
      last_import_run_id: input.importRunId,
      relationship_kind: input.relationshipKind ?? "imported",
      created_at: now,
      updated_at: now,
    })
    .onConflictDoNothing()
    .returning({ activityId: activitySourceReferences.activity_id });
  if (directOnly) return { activityId: directOnly.activityId, inserted: true };

  const [concurrentDirect] = await tx
    .select({ activityId: activitySourceReferences.activity_id })
    .from(activitySourceReferences)
    .where(
      and(
        eq(activitySourceReferences.profile_id, input.profileId),
        eq(activitySourceReferences.provider, input.provider),
        eq(activitySourceReferences.provider_external_id, input.providerExternalId),
        inArray(activitySourceReferences.resolution_status, canonicalResolutionStatuses),
        isNotNull(activitySourceReferences.activity_id),
      ),
    )
    .limit(1);
  if (!concurrentDirect)
    throw new Error("Activity source reference direct attachment could not be persisted");
  return { activityId: concurrentDirect.activityId, inserted: false };
}
