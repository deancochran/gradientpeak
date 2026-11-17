import { activities, activitySegments, plannedSessions } from "@repo/db";
import { and, asc, eq, exists, gt, isNotNull, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { DrizzleQueryExecutor } from "../db";

const candidateRowSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    startedAt: z.coerce.date(),
    elapsedMs: z.coerce.number().int().positive(),
  })
  .strict();

export type PlannedSessionCompletionCandidateCursor = { startedAt: Date; id: string };

export type PlannedSessionCompletionCandidate = {
  id: string;
  name: string;
  activityCategory: "run" | "bike" | "swim" | "strength" | "other";
  startedAt: Date;
  elapsedMs: number;
};

export type LinkedActivityObservation = {
  distanceMeters: number | null;
  elapsedMs: number | null;
};

/** Reads comparison inputs without expanding a linked activity into its full viewer projection. */
export async function readOwnedLinkedActivityObservation(
  db: DrizzleQueryExecutor,
  input: { activityId: string; profileId: string },
): Promise<LinkedActivityObservation | null> {
  const [activity] = await db
    .select({ distanceMeters: activities.distance_meters, elapsedMs: activities.elapsed_ms })
    .from(activities)
    .where(
      and(
        eq(activities.id, input.activityId),
        eq(activities.profile_id, input.profileId),
        isNull(activities.superseded_by_activity_id),
      ),
    )
    .limit(1);
  return activity ?? null;
}

/** Reads only active manual completions that may be replaced by an explicit association. */
export async function readActiveManualCompletionActivityId(
  db: DrizzleQueryExecutor,
  input: { profileId: string; activityId: string },
): Promise<string | null> {
  const [activity] = await db
    .select({ id: activities.id })
    .from(activities)
    .where(
      and(
        eq(activities.id, input.activityId),
        eq(activities.profile_id, input.profileId),
        eq(activities.entry_provenance, "manual"),
        isNull(activities.superseded_by_activity_id),
      ),
    )
    .limit(1);
  return activity?.id ?? null;
}

/** Lists explicit, owner-scoped imported activity choices in a stable keyset order. */
export async function listPlannedSessionCompletionCandidates(
  db: DrizzleQueryExecutor,
  input: {
    profileId: string;
    sessionId: string;
    activityCategory: PlannedSessionCompletionCandidate["activityCategory"];
    limit: number;
    cursor?: PlannedSessionCompletionCandidateCursor;
  },
): Promise<{
  items: PlannedSessionCompletionCandidate[];
  nextCursor: PlannedSessionCompletionCandidateCursor | null;
}> {
  const rows = await db
    .select({
      id: activities.id,
      name: activities.name,
      startedAt: activities.started_at,
      elapsedMs: activities.elapsed_ms,
    })
    .from(activities)
    .where(
      and(
        eq(activities.profile_id, input.profileId),
        sql`${activities.entry_provenance} is distinct from 'manual'`,
        isNull(activities.superseded_by_activity_id),
        isNotNull(activities.started_at),
        sql`${activities.elapsed_ms} > 0`,
        exists(
          db
            .select({ id: activitySegments.id })
            .from(activitySegments)
            .where(
              and(
                eq(activitySegments.activity_id, activities.id),
                eq(activitySegments.profile_id, input.profileId),
                eq(activitySegments.activity_category, input.activityCategory),
              ),
            ),
        ),
        sql`not exists (
          select 1 from ${plannedSessions}
          where ${plannedSessions.profile_id} = ${input.profileId}::uuid
            and ${plannedSessions.completed_activity_id} = ${activities.id}
            and ${plannedSessions.id} <> ${input.sessionId}::uuid
        )`,
        input.cursor
          ? or(
              gt(activities.started_at, input.cursor.startedAt),
              and(
                eq(activities.started_at, input.cursor.startedAt),
                gt(activities.id, input.cursor.id),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(asc(activities.started_at), asc(activities.id))
    .limit(input.limit + 1);
  const page = rows.slice(0, input.limit).map((row) => candidateRowSchema.parse(row));
  const last = page.at(-1);
  return {
    items: page.map((row) => ({ ...row, activityCategory: input.activityCategory })),
    nextCursor:
      rows.length > input.limit && last ? { startedAt: last.startedAt, id: last.id } : null,
  };
}
