import { parseActivityFile } from "@repo/core/server/activity-files";
import {
  activities,
  activityArtifactLinks,
  activityArtifacts,
  activitySegments,
  db,
  pool,
} from "@repo/db";
import { and, asc, eq } from "drizzle-orm";
import { replayParsedActivityFileEvidenceProfile } from "../src/application/activity-file-ingestion/reconcile-parsed-activity-file-evidence";
import { getApiStorageService } from "../src/storage-service";

const BUCKET = "activity-files";
const DEFAULT_CONCURRENCY = 2;
const MAX_CONCURRENCY = 8;

function parseArguments(args: string[]) {
  let write = false;
  let concurrency = DEFAULT_CONCURRENCY;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--confirm") {
      write = true;
      continue;
    }
    if (argument === "--concurrency") {
      concurrency = Number(args[index + 1]);
      index += 1;
      continue;
    }
    throw new Error(`Unsupported argument: ${argument}`);
  }
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > MAX_CONCURRENCY) {
    throw new Error(`--concurrency must be an integer from 1 to ${MAX_CONCURRENCY}`);
  }
  return { concurrency, write };
}

interface Aggregate {
  profilesSucceeded: number;
  profilesFailed: number;
  activitiesAttempted: number;
  activitiesSucceeded: number;
  downloadFailures: number;
  parseFailures: number;
  reconciliationFailures: number;
  effortDeletes: number;
  effortInserts: number;
  effortUpdates: number;
  metricDeletes: number;
  metricInserts: number;
  metricUpdates: number;
}

function emptyAggregate(): Aggregate {
  return {
    profilesSucceeded: 0,
    profilesFailed: 0,
    activitiesAttempted: 0,
    activitiesSucceeded: 0,
    downloadFailures: 0,
    parseFailures: 0,
    reconciliationFailures: 0,
    effortDeletes: 0,
    effortInserts: 0,
    effortUpdates: 0,
    metricDeletes: 0,
    metricInserts: 0,
    metricUpdates: 0,
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const storage = getApiStorageService();
  const profiles = await db
    .selectDistinct({ profileId: activities.profile_id })
    .from(activityArtifactLinks)
    .innerJoin(activities, eq(activities.id, activityArtifactLinks.activity_id))
    .where(
      and(eq(activityArtifactLinks.role, "source"), eq(activityArtifactLinks.is_current, true)),
    )
    .orderBy(asc(activities.profile_id));
  const aggregate = emptyAggregate();
  let nextProfile = 0;

  async function worker() {
    while (nextProfile < profiles.length) {
      const profile = profiles[nextProfile];
      nextProfile += 1;
      if (!profile) return;
      const candidates = await db
        .select({
          activityFilePath: activityArtifacts.path,
          activityId: activities.id,
          activityType: activitySegments.category,
        })
        .from(activities)
        .innerJoin(
          activityArtifactLinks,
          and(
            eq(activityArtifactLinks.activity_id, activities.id),
            eq(activityArtifactLinks.role, "source"),
            eq(activityArtifactLinks.is_current, true),
          ),
        )
        .innerJoin(activityArtifacts, eq(activityArtifacts.id, activityArtifactLinks.artifact_id))
        .innerJoin(
          activitySegments,
          and(
            eq(activitySegments.activity_id, activities.id),
            eq(activitySegments.role, "activity"),
          ),
        )
        .where(eq(activities.profile_id, profile.profileId))
        .orderBy(asc(activities.finished_at), asc(activities.id));
      aggregate.activitiesAttempted += candidates.length;
      const parsedActivities: Array<{
        activityId: string;
        activityType: string;
        parsedData: ReturnType<typeof parseActivityFile>;
      }> = [];
      let preparationFailed = false;

      for (const candidate of candidates) {
        if (!candidate.activityType) continue;
        const { data: blob, error } = await storage.storage
          .from(BUCKET)
          .download(candidate.activityFilePath);
        if (error || !blob) {
          aggregate.downloadFailures += 1;
          preparationFailed = true;
          continue;
        }

        let parsedData: ReturnType<typeof parseActivityFile>;
        try {
          parsedData = parseActivityFile({
            data: Buffer.from(await blob.arrayBuffer()),
            fileName: candidate.activityFilePath,
          });
        } catch {
          aggregate.parseFailures += 1;
          preparationFailed = true;
          continue;
        }
        parsedActivities.push({
          activityId: candidate.activityId,
          activityType: candidate.activityType,
          parsedData,
        });
      }

      if (preparationFailed) {
        aggregate.profilesFailed += 1;
        continue;
      }

      try {
        const results = await replayParsedActivityFileEvidenceProfile(db, {
          profileId: profile.profileId,
          activities: parsedActivities,
          write: options.write,
        });
        aggregate.profilesSucceeded += 1;
        aggregate.activitiesSucceeded += results.length;
        for (const result of results) {
          for (const key of [
            "effortDeletes",
            "effortInserts",
            "effortUpdates",
            "metricDeletes",
            "metricInserts",
            "metricUpdates",
          ] as const) {
            aggregate[key] += result[key];
          }
        }
      } catch {
        aggregate.profilesFailed += 1;
        aggregate.reconciliationFailures += 1;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(options.concurrency, profiles.length) }, () => worker()),
  );
  const failures =
    aggregate.downloadFailures + aggregate.parseFailures + aggregate.reconciliationFailures;
  console.log(
    JSON.stringify({
      mode: options.write ? "write" : "dry-run",
      profilesAttempted: profiles.length,
      ...aggregate,
      failures,
    }),
  );
  if (failures > 0) process.exitCode = 1;
}

try {
  await main();
} catch {
  console.error(JSON.stringify({ status: "failed", reason: "configuration-or-query-error" }));
  process.exitCode = 1;
} finally {
  await pool.end();
}
