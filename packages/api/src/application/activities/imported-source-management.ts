import { persistentIntegrationSourceIdSchema } from "@repo/core";
import { activities, activitySourceReferences, integrations } from "@repo/db";
import { and, eq } from "drizzle-orm";
import type { getRequiredDb } from "../../db";
import {
  deleteRemoteActivitySourceWithCanonicalCleanup,
  listActivitySourceReferencesForActivity,
  lockActivitySourceResolution,
} from "../../repositories/activity-source-reference-repository";
import { getProviderReviewedSourceMaterializationRuntime } from "../integrations/provider-runtime-registry";
import { deleteCanonicalActivityWithProfileLockHeld } from "./activity-mutations";

type Db = ReturnType<typeof getRequiredDb>;

export async function getImportedSourcesForOwnedActivity(input: {
  activityId: string;
  db: Db;
  profileId: string;
}) {
  return input.db.transaction((tx) => listActivitySourceReferencesForActivity(tx, input));
}

export class ImportedSourceNotFoundError extends Error {}
export class ImportedSourceResolutionError extends Error {}
export class ImportedSourceGenerationInactiveError extends Error {}

export async function deleteImportedActivitySource(input: {
  db: Db;
  integrationId: string;
  integrationGeneration?: number;
  now?: Date;
  profileId: string;
  provider: "strava" | "wahoo";
  providerExternalId: string;
  providerRevision?: string | null;
}) {
  return input.db.transaction(async (tx) => {
    await lockActivitySourceResolution(tx, input.profileId);
    if (input.integrationGeneration !== undefined) {
      const [activeIntegration] = await tx
        .select({ id: integrations.id })
        .from(integrations)
        .where(
          and(
            eq(integrations.id, input.integrationId),
            eq(integrations.profile_id, input.profileId),
            eq(integrations.provider, input.provider),
            eq(integrations.lifecycle_status, "active"),
            eq(integrations.generation, input.integrationGeneration),
          ),
        )
        .limit(1)
        .for("share");
      if (!activeIntegration) throw new ImportedSourceGenerationInactiveError();
    }
    return deleteRemoteActivitySourceWithCanonicalCleanup(tx, input, ({ activityId, profileId }) =>
      deleteCanonicalActivityWithProfileLockHeld({
        activityId,
        ...(input.now === undefined ? {} : { now: input.now }),
        profileId,
        tx,
      }),
    );
  });
}

export async function resolveImportedSourceForProfile(input: {
  action: "confirm_same" | "move" | "ignore";
  db: Db;
  profileId: string;
  sourceReferenceId: string;
  targetActivityId?: string;
}) {
  return input.db.transaction(async (tx) => {
    await lockActivitySourceResolution(tx, input.profileId);
    const [source] = await tx
      .select({ activityId: activitySourceReferences.activity_id })
      .from(activitySourceReferences)
      .where(
        and(
          eq(activitySourceReferences.id, input.sourceReferenceId),
          eq(activitySourceReferences.profile_id, input.profileId),
          eq(activitySourceReferences.resolution_status, "review"),
        ),
      )
      .limit(1);
    if (!source) throw new ImportedSourceNotFoundError("Imported source is unavailable");

    const targetActivityId =
      input.action === "confirm_same" ? source.activityId : input.targetActivityId;
    if (input.action === "ignore") {
      const [updated] = await tx
        .update(activitySourceReferences)
        .set({ activity_id: null, resolution_status: "ignored", updated_at: new Date() })
        .where(
          and(
            eq(activitySourceReferences.id, input.sourceReferenceId),
            eq(activitySourceReferences.profile_id, input.profileId),
            eq(activitySourceReferences.resolution_status, "review"),
          ),
        )
        .returning({ id: activitySourceReferences.id });
      if (!updated)
        throw new ImportedSourceNotFoundError("Imported source changed before resolution");
      return { activityId: null, resolutionStatus: "ignored" as const };
    }
    if (!targetActivityId) {
      throw new ImportedSourceResolutionError("A target activity is required");
    }
    const [target] = await tx
      .select({ id: activities.id })
      .from(activities)
      .where(and(eq(activities.id, targetActivityId), eq(activities.profile_id, input.profileId)))
      .limit(1);
    if (!target) throw new ImportedSourceNotFoundError("Target activity is unavailable");
    const [updated] = await tx
      .update(activitySourceReferences)
      .set({ activity_id: target.id, resolution_status: "confirmed", updated_at: new Date() })
      .where(
        and(
          eq(activitySourceReferences.id, input.sourceReferenceId),
          eq(activitySourceReferences.profile_id, input.profileId),
          eq(activitySourceReferences.resolution_status, "review"),
        ),
      )
      .returning({ id: activitySourceReferences.id });
    if (!updated)
      throw new ImportedSourceNotFoundError("Imported source changed before resolution");
    return { activityId: target.id, resolutionStatus: "confirmed" as const };
  });
}

/**
 * The review row is the durable idempotency anchor.  It stays in review until the provider job
 * has fetched and atomically materialized its own canonical activity.
 */
export async function keepImportedSourceSeparateForProfile(input: {
  db: Db;
  profileId: string;
  sourceReferenceId: string;
}) {
  return input.db.transaction(async (tx) => {
    await lockActivitySourceResolution(tx, input.profileId);
    const [source] = await tx
      .select({
        integrationGeneration: integrations.generation,
        integrationId: integrations.id,
        provider: activitySourceReferences.provider,
        providerExternalId: activitySourceReferences.provider_external_id,
      })
      .from(activitySourceReferences)
      .innerJoin(integrations, eq(integrations.id, activitySourceReferences.integration_id))
      .where(
        and(
          eq(activitySourceReferences.id, input.sourceReferenceId),
          eq(activitySourceReferences.profile_id, input.profileId),
          eq(activitySourceReferences.resolution_status, "review"),
          eq(integrations.profile_id, input.profileId),
          eq(integrations.lifecycle_status, "active"),
        ),
      )
      .limit(1)
      .for("update");
    if (!source) throw new ImportedSourceNotFoundError("Imported source is unavailable");
    const parsedProvider = persistentIntegrationSourceIdSchema.safeParse(source.provider);
    const runtime = parsedProvider.success
      ? getProviderReviewedSourceMaterializationRuntime(parsedProvider.data)
      : null;
    if (!runtime) {
      throw new ImportedSourceResolutionError(
        "Keeping this provider activity separate is unavailable",
      );
    }
    const job = await runtime.enqueueReviewedActivityMaterialization({
      db: input.db,
      integration: { generation: source.integrationGeneration, id: source.integrationId },
      profileId: input.profileId,
      providerExternalId: source.providerExternalId,
      sourceReferenceId: input.sourceReferenceId,
      transaction: tx,
    });
    return { jobId: job.id, queued: job.status === "queued" };
  });
}
