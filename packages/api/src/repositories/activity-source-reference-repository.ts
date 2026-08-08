import { activitySourceReferences } from "@repo/db";
import { and, eq, sql } from "drizzle-orm";
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
};

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

export async function resolveCanonicalActivityReference(
  tx: DrizzleTransactionClient,
  source: ActivitySourceIdentity,
) {
  const origin = trustedOrigin(source);
  const [direct] = await tx
    .select({ activityId: activitySourceReferences.activity_id })
    .from(activitySourceReferences)
    .where(
      and(
        eq(activitySourceReferences.profile_id, source.profileId),
        eq(activitySourceReferences.provider, source.provider),
        eq(activitySourceReferences.provider_external_id, source.providerExternalId),
      ),
    )
    .limit(1);
  if (direct) return direct.activityId;

  if (origin) {
    const [originReference] = await tx
      .select({ activityId: activitySourceReferences.activity_id })
      .from(activitySourceReferences)
      .where(
        and(
          eq(activitySourceReferences.profile_id, source.profileId),
          eq(activitySourceReferences.origin_provider, origin.provider),
          eq(activitySourceReferences.origin_external_id, origin.externalId),
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
  const now = input.now ?? new Date();
  const origin = trustedOrigin(input);
  await lockActivitySourceResolution(tx, input.profileId);
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
        updated_at: now,
      })
      .where(
        and(
          eq(activitySourceReferences.profile_id, input.profileId),
          eq(activitySourceReferences.provider, input.provider),
          eq(activitySourceReferences.provider_external_id, input.providerExternalId),
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
      ),
    )
    .limit(1);
  if (!concurrentDirect)
    throw new Error("Activity source reference direct attachment could not be persisted");
  return { activityId: concurrentDirect.activityId, inserted: false };
}
