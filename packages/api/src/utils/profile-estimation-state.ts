import { type DrizzleDbClient, profileEstimationState } from "@repo/db";
import { eq, sql } from "drizzle-orm";
import { enqueueActivityPlanRefreshesForProfile } from "./activity-plan-refresh-queue";

export type ProfileEstimationRevisionKind = "metrics" | "performance" | "fitness";

export async function getProfileEstimationState(db: DrizzleDbClient, profileId: string) {
  const [row] = await db
    .select()
    .from(profileEstimationState)
    .where(eq(profileEstimationState.profile_id, profileId))
    .limit(1);

  return (
    row ?? {
      profile_id: profileId,
      metrics_revision: 0,
      performance_revision: 0,
      fitness_revision: 0,
      dirty_since: null,
      updated_at: new Date(0),
    }
  );
}

export async function bumpProfileEstimationState(
  db: DrizzleDbClient,
  profileId: string,
  kinds: ProfileEstimationRevisionKind[],
) {
  await markProfileAnalysisDirty(db, { profileId, kinds });
}

export async function markProfileAnalysisDirty(
  db: DrizzleDbClient,
  input: {
    profileId: string;
    kinds: ProfileEstimationRevisionKind[];
    dirtySince?: Date | string | null;
  },
) {
  const { profileId, kinds } = input;
  if (kinds.length === 0) return;

  const uniqueKinds = [...new Set(kinds)];
  const now = new Date();
  const dirtySince = input.dirtySince ? new Date(input.dirtySince) : null;
  const dirtySinceUpdate = dirtySince
    ? sql`least(coalesce(${profileEstimationState.dirty_since}, ${dirtySince}), ${dirtySince})`
    : profileEstimationState.dirty_since;

  await db
    .insert(profileEstimationState)
    .values({
      profile_id: profileId,
      metrics_revision: uniqueKinds.includes("metrics") ? 1 : 0,
      performance_revision: uniqueKinds.includes("performance") ? 1 : 0,
      fitness_revision: uniqueKinds.includes("fitness") ? 1 : 0,
      dirty_since: dirtySince,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: [profileEstimationState.profile_id],
      set: {
        metrics_revision: uniqueKinds.includes("metrics")
          ? sql`${profileEstimationState.metrics_revision} + 1`
          : profileEstimationState.metrics_revision,
        performance_revision: uniqueKinds.includes("performance")
          ? sql`${profileEstimationState.performance_revision} + 1`
          : profileEstimationState.performance_revision,
        fitness_revision: uniqueKinds.includes("fitness")
          ? sql`${profileEstimationState.fitness_revision} + 1`
          : profileEstimationState.fitness_revision,
        dirty_since: dirtySinceUpdate,
        updated_at: now,
      },
    });

  await enqueueActivityPlanRefreshesForProfile(db, {
    profileId,
    now,
  });
}
