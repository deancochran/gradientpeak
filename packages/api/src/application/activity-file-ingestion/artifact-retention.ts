import { activityArtifactLinks, activityArtifacts } from "@repo/db";
import { and, asc, eq, ne, notExists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { getRequiredDb } from "../../db";
import type { ActivityArtifactStorage } from "./artifact-storage";

type DbClient = ReturnType<typeof getRequiredDb>;

/**
 * Service-authority lifecycle around DB-owned retention functions.
 * `request_activity_artifact_deletion` must atomically revoke/de-reference every artifact link.
 */
export function createActivityArtifactRetentionService(
  db: DbClient,
  storage: ActivityArtifactStorage,
) {
  async function deleteForProfile(input: {
    artifactId: string;
    profileId: string;
    purge?: boolean;
  }) {
    const [artifact] = await db
      .select()
      .from(activityArtifacts)
      .where(
        and(
          eq(activityArtifacts.id, input.artifactId),
          eq(activityArtifacts.profile_id, input.profileId),
        ),
      )
      .limit(1);
    if (!artifact) return { status: "purged" as const };

    if (artifact.availability === "deleted") {
      if (input.purge !== false) {
        await db.execute(
          sql`select public.purge_deleted_activity_artifact(${input.artifactId}::uuid)`,
        );
        return { status: "purged" as const };
      }
      return { status: "deleted" as const };
    }

    if (artifact.availability === "accepted") {
      await db.execute(
        sql`select public.request_activity_artifact_deletion(${input.artifactId}::uuid)`,
      );
    }

    const removal = await storage.storage.from(artifact.bucket).remove([artifact.path]);
    if (removal && typeof removal === "object" && "error" in removal && removal.error) {
      throw new Error("Failed to delete retained activity artifact storage bytes");
    }

    await db.execute(
      sql`select public.finalize_activity_artifact_deletion(${input.artifactId}::uuid, true)`,
    );
    if (input.purge !== false) {
      await db.execute(
        sql`select public.purge_deleted_activity_artifact(${input.artifactId}::uuid)`,
      );
      return { status: "purged" as const };
    }
    return { status: "deleted" as const };
  }

  async function deleteArtifactRows(
    rows: ReadonlyArray<{ id: string }>,
    profileId: string,
  ): Promise<number> {
    for (const artifact of rows) {
      await deleteForProfile({ artifactId: artifact.id, profileId });
    }
    return rows.length;
  }

  return {
    deleteForProfile,

    async resumeDeletionForProfile(profileId: string, batchSize = 100) {
      const incomplete = await db
        .select({ id: activityArtifacts.id })
        .from(activityArtifacts)
        .where(
          and(
            eq(activityArtifacts.profile_id, profileId),
            ne(activityArtifacts.availability, "accepted"),
          ),
        )
        .orderBy(asc(activityArtifacts.id))
        .limit(batchSize);
      return deleteArtifactRows(incomplete, profileId);
    },

    async deleteForActivity(input: { activityId: string; profileId: string }) {
      const otherLinks = alias(activityArtifactLinks, "other_activity_artifact_links");
      let deleted = 0;
      while (true) {
        const linked = await db
          .select({ id: activityArtifacts.id })
          .from(activityArtifactLinks)
          .innerJoin(activityArtifacts, eq(activityArtifacts.id, activityArtifactLinks.artifact_id))
          .where(
            and(
              eq(activityArtifactLinks.activity_id, input.activityId),
              eq(activityArtifactLinks.profile_id, input.profileId),
              // Content-addressed artifacts may be shared by duplicate imports. The parent cascade
              // removes this activity's link, but bytes remain while another activity needs them.
              notExists(
                db
                  .select({ value: sql`1` })
                  .from(otherLinks)
                  .where(
                    and(
                      eq(otherLinks.artifact_id, activityArtifactLinks.artifact_id),
                      ne(otherLinks.activity_id, input.activityId),
                    ),
                  ),
              ),
            ),
          )
          .orderBy(asc(activityArtifactLinks.ordinal), asc(activityArtifacts.id))
          .limit(100);
        if (linked.length === 0) return deleted;
        deleted += await deleteArtifactRows(linked, input.profileId);
      }
    },

    /** Account deletion preflight: bounded, serial, and safe to retry after any failed object removal. */
    async deleteAllForProfile(profileId: string, batchSize = 100) {
      let deleted = 0;
      while (true) {
        const batch = await db
          .select({ id: activityArtifacts.id })
          .from(activityArtifacts)
          .where(eq(activityArtifacts.profile_id, profileId))
          .orderBy(asc(activityArtifacts.id))
          .limit(batchSize);
        if (batch.length === 0) return deleted;
        deleted += await deleteArtifactRows(batch, profileId);
      }
    },
  };
}
