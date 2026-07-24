import { activities, activitySessionRpeEvidence } from "@repo/db";
import { and, asc, eq, inArray, lte, notExists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import type { DrizzleQueryExecutor, getRequiredDb } from "../db";

type DbClient = ReturnType<typeof getRequiredDb>;
export type ActivitySessionRpeTransaction = Parameters<Parameters<DbClient["transaction"]>[0]>[0];

export const activitySessionRpeEvidenceProjectionSchema = z
  .object({
    id: z.string().uuid(),
    profileId: z.string().uuid(),
    activityId: z.string().uuid(),
    recordedAt: z.coerce.date(),
    correctedAt: z.coerce.date().nullable(),
    rpe: z.number().int().min(1).max(10),
    scale: z.string().min(1),
    scaleVersion: z.string().min(1),
    source: z.enum(["user", "provider", "manual"]),
    operationId: z.string().uuid(),
    correctionOfId: z.string().uuid().nullable(),
    provenance: z.record(z.string(), z.unknown()),
    createdAt: z.coerce.date(),
  })
  .strict();

export type ActivitySessionRpeEvidenceProjection = z.infer<
  typeof activitySessionRpeEvidenceProjectionSchema
>;

const projection = {
  id: activitySessionRpeEvidence.id,
  profileId: activitySessionRpeEvidence.profile_id,
  activityId: activitySessionRpeEvidence.activity_id,
  recordedAt: activitySessionRpeEvidence.recorded_at,
  correctedAt: activitySessionRpeEvidence.corrected_at,
  rpe: activitySessionRpeEvidence.rpe,
  scale: activitySessionRpeEvidence.scale,
  scaleVersion: activitySessionRpeEvidence.scale_version,
  source: activitySessionRpeEvidence.source,
  operationId: activitySessionRpeEvidence.operation_id,
  correctionOfId: activitySessionRpeEvidence.correction_of_id,
  provenance: activitySessionRpeEvidence.provenance,
  createdAt: activitySessionRpeEvidence.created_at,
};

function parseProjection(row: unknown): ActivitySessionRpeEvidenceProjection {
  return activitySessionRpeEvidenceProjectionSchema.parse(row);
}

export async function findOwnedCompletedActivity(
  tx: ActivitySessionRpeTransaction,
  input: { activityId: string; now: Date; profileId: string },
) {
  const [activity] = await tx
    .select({ id: activities.id })
    .from(activities)
    .where(
      and(
        eq(activities.id, input.activityId),
        eq(activities.profile_id, input.profileId),
        lte(activities.finished_at, input.now),
      ),
    )
    .limit(1);
  return activity;
}

export async function findOwnedSessionRpeEvidenceByOperation(
  tx: ActivitySessionRpeTransaction,
  input: { operationId: string; profileId: string },
) {
  const [row] = await tx
    .select(projection)
    .from(activitySessionRpeEvidence)
    .where(
      and(
        eq(activitySessionRpeEvidence.profile_id, input.profileId),
        eq(activitySessionRpeEvidence.operation_id, input.operationId),
      ),
    )
    .limit(1);
  return row ? parseProjection(row) : undefined;
}

export async function findOwnedSessionRpeEvidence(
  tx: ActivitySessionRpeTransaction,
  input: { activityId: string; evidenceId: string; profileId: string },
) {
  const [row] = await tx
    .select(projection)
    .from(activitySessionRpeEvidence)
    .where(
      and(
        eq(activitySessionRpeEvidence.id, input.evidenceId),
        eq(activitySessionRpeEvidence.activity_id, input.activityId),
        eq(activitySessionRpeEvidence.profile_id, input.profileId),
      ),
    )
    .limit(1);
  return row ? parseProjection(row) : undefined;
}

export async function findSessionRpeCorrection(
  tx: ActivitySessionRpeTransaction,
  input: { correctionOfId: string },
) {
  const [row] = await tx
    .select({ id: activitySessionRpeEvidence.id })
    .from(activitySessionRpeEvidence)
    .where(eq(activitySessionRpeEvidence.correction_of_id, input.correctionOfId))
    .limit(1);
  return row;
}

export async function insertSessionRpeEvidence(
  tx: ActivitySessionRpeTransaction,
  input: typeof activitySessionRpeEvidence.$inferInsert,
) {
  const [row] = await tx.insert(activitySessionRpeEvidence).values(input).returning(projection);
  if (!row) throw new Error("Failed to persist session-RPE evidence");
  return parseProjection(row);
}

/** Effective non-superseded RPE projections for a bounded owned activity set. */
export async function listOwnedEffectiveSessionRpeEvidenceForActivities(
  db: DrizzleQueryExecutor,
  input: { activityIds: readonly string[]; profileId: string },
): Promise<ActivitySessionRpeEvidenceProjection[]> {
  if (input.activityIds.length === 0) return [];
  const replacement = alias(activitySessionRpeEvidence, "session_rpe_replacement");
  const rows = await db
    .select(projection)
    .from(activitySessionRpeEvidence)
    .where(
      and(
        eq(activitySessionRpeEvidence.profile_id, input.profileId),
        inArray(activitySessionRpeEvidence.activity_id, [...input.activityIds]),
        notExists(
          db
            .select({ id: replacement.id })
            .from(replacement)
            .where(
              and(
                eq(replacement.correction_of_id, activitySessionRpeEvidence.id),
                eq(replacement.profile_id, input.profileId),
              ),
            ),
        ),
      ),
    )
    .orderBy(
      asc(activitySessionRpeEvidence.activity_id),
      asc(activitySessionRpeEvidence.recorded_at),
      asc(activitySessionRpeEvidence.id),
    );
  return rows.map(parseProjection);
}

/** Non-superseded RPE history for one owned activity, ordered for a Core adapter. */
export async function listOwnedEffectiveSessionRpeEvidence(
  tx: ActivitySessionRpeTransaction,
  input: { activityId: string; profileId: string },
) {
  const replacement = alias(activitySessionRpeEvidence, "session_rpe_replacement");
  const rows = await tx
    .select(projection)
    .from(activitySessionRpeEvidence)
    .where(
      and(
        eq(activitySessionRpeEvidence.activity_id, input.activityId),
        eq(activitySessionRpeEvidence.profile_id, input.profileId),
        notExists(
          tx
            .select({ id: replacement.id })
            .from(replacement)
            .where(eq(replacement.correction_of_id, activitySessionRpeEvidence.id)),
        ),
      ),
    )
    .orderBy(asc(activitySessionRpeEvidence.recorded_at), asc(activitySessionRpeEvidence.id));
  return rows.map(parseProjection);
}

/**
 * The one effective RPE observation admitted to an owned activity detail.
 * Legacy data can contain multiple non-superseded rows; the latest recorded
 * observation is the same deterministic choice used by the analysis adapter.
 */
export async function findOwnedEffectiveSessionRpeEvidence(
  db: DrizzleQueryExecutor,
  input: { activityId: string; profileId: string },
): Promise<ActivitySessionRpeEvidenceProjection | null> {
  const rows = await listOwnedEffectiveSessionRpeEvidenceForActivities(db, {
    activityIds: [input.activityId],
    profileId: input.profileId,
  });
  return rows.at(-1) ?? null;
}

export async function lockSessionRpeActivity(
  tx: ActivitySessionRpeTransaction,
  input: { activityId: string; profileId: string },
) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`${input.profileId}:${input.activityId}:session-rpe`}, 0))`,
  );
}
