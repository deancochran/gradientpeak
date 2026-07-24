import { readFile, writeFile } from "node:fs/promises";
import { parseActivityFile } from "@repo/core/server/activity-files";
import { activities, activityArtifactLinks, activityArtifacts, db, pool } from "@repo/db";
import { and, asc, eq, gt, or } from "drizzle-orm";
import { replayParsedActivityFileEvidenceProfile } from "../src/application/activity-file-ingestion/reconcile-parsed-activity-file-evidence";
import { getApiStorageService } from "../src/storage-service";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

type Checkpoint = { activityId: string; finishedAt: string; version: 1 };
type Failure = { activityId: string; reason: string };

function parseArguments(args: string[]) {
  let checkpointPath: string | undefined;
  let limit = DEFAULT_LIMIT;
  let write = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--confirm") {
      write = true;
      continue;
    }
    if (argument === "--checkpoint") {
      checkpointPath = args[index + 1];
      index += 1;
      continue;
    }
    if (argument === "--limit") {
      limit = Number(args[index + 1]);
      index += 1;
      continue;
    }
    throw new Error(`Unsupported argument: ${argument}`);
  }
  if (!checkpointPath) throw new Error("--checkpoint is required");
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new Error(`--limit must be an integer from 1 to ${MAX_LIMIT}`);
  }
  return { checkpointPath, limit, write };
}

async function readCheckpoint(path: string): Promise<Checkpoint | null> {
  try {
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    if (
      value &&
      typeof value === "object" &&
      "version" in value &&
      value.version === 1 &&
      "activityId" in value &&
      typeof value.activityId === "string" &&
      "finishedAt" in value &&
      typeof value.finishedAt === "string" &&
      Number.isFinite(Date.parse(value.finishedAt))
    ) {
      return value as Checkpoint;
    }
    throw new Error("Checkpoint has an invalid shape");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeCheckpoint(path: string, checkpoint: Checkpoint) {
  await writeFile(path, `${JSON.stringify(checkpoint)}\n`, { encoding: "utf8", mode: 0o600 });
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const checkpoint = await readCheckpoint(options.checkpointPath);
  const storage = getApiStorageService();
  const sourceLink = and(
    eq(activityArtifactLinks.role, "source"),
    eq(activityArtifactLinks.is_current, true),
  );
  const candidates = await db
    .select({
      activityId: activities.id,
      artifactBucket: activityArtifacts.bucket,
      artifactPath: activityArtifacts.path,
      finishedAt: activities.finished_at,
      profileId: activities.profile_id,
    })
    .from(activities)
    .innerJoin(
      activityArtifactLinks,
      and(eq(activityArtifactLinks.activity_id, activities.id), sourceLink),
    )
    .innerJoin(activityArtifacts, eq(activityArtifacts.id, activityArtifactLinks.artifact_id))
    .where(
      and(
        eq(activityArtifacts.availability, "accepted"),
        checkpoint
          ? or(
              gt(activities.finished_at, new Date(checkpoint.finishedAt)),
              and(
                eq(activities.finished_at, new Date(checkpoint.finishedAt)),
                gt(activities.id, checkpoint.activityId),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(asc(activities.finished_at), asc(activities.id))
    .limit(options.limit);

  const failures: Failure[] = [];
  let succeeded = 0;
  for (const candidate of candidates) {
    let parsedData: ReturnType<typeof parseActivityFile>;
    try {
      const { data: blob, error } = await storage.storage
        .from(candidate.artifactBucket)
        .download(candidate.artifactPath);
      if (error || !blob) throw new Error("artifact_download_unavailable");
      parsedData = parseActivityFile({
        data: Buffer.from(await blob.arrayBuffer()),
        fileName: candidate.artifactPath,
      });
    } catch (error) {
      failures.push({
        activityId: candidate.activityId,
        reason:
          error instanceof Error && error.message === "artifact_download_unavailable"
            ? "artifact_download_unavailable"
            : "artifact_parse_failed",
      });
      break;
    }

    try {
      await replayParsedActivityFileEvidenceProfile(db, {
        profileId: candidate.profileId,
        activities: [
          { activityId: candidate.activityId, activityType: "retained_artifact", parsedData },
        ],
        write: options.write,
      });
      succeeded += 1;
    } catch {
      failures.push({ activityId: candidate.activityId, reason: "evidence_reconciliation_failed" });
      break;
    }

    // Advance only after a durable reconciliation. Failures remain before the
    // checkpoint and are surfaced explicitly so an operator can repair/retry them.
    if (options.write) {
      await writeCheckpoint(options.checkpointPath, {
        activityId: candidate.activityId,
        finishedAt: candidate.finishedAt.toISOString(),
        version: 1,
      });
    }
  }

  console.log(
    JSON.stringify({
      reconciled: succeeded,
      failures,
      mode: options.write ? "write" : "dry-run",
      processed: candidates.length,
      remainingMayExist: failures.length > 0 || candidates.length === options.limit,
    }),
  );
  if (failures.length > 0) process.exitCode = 1;
}

try {
  await main();
} catch {
  console.error(JSON.stringify({ status: "failed", reason: "configuration-or-query-error" }));
  process.exitCode = 1;
} finally {
  await pool.end();
}
