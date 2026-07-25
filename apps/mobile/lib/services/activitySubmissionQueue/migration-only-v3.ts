/** Restartable converter for pre-v3 AsyncStorage. SQLite markers are written before source deletion. */
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  type RecordingActivityCategory,
  type RecordingExecutionManifest,
  recordingSessionArtifactSchema,
} from "@repo/core";
import { Directory, File, Paths } from "expo-file-system";
import { z } from "zod";
import { withRecordingEvidenceTransaction } from "../ActivityRecorder/recordingEvidenceJournal";
import { getLocalActivityArtifactMetadata } from "./localArtifact";
import { upsertActivitySubmissionQueueJob } from "./storage";
import { activitySubmissionQueueJobSchema } from "./types";

export const LEGACY_PENDING_FINALIZED_ARTIFACT_KEY = "activity-recorder:pending-finalized-artifact";
export const LEGACY_ACTIVITY_SUBMISSION_QUEUE_JOBS_KEY = "activity-submission-queue:jobs";

function singleSportManifest(input: {
  segmentId: string;
  sessionId: string;
  category: RecordingActivityCategory;
  startedAt: string;
  completedAt: string;
  activeSeconds: number;
  movingSeconds: number;
  distanceMeters: number;
}): RecordingExecutionManifest {
  return {
    version: 1,
    compilerVersion: 1,
    planHash: "0".repeat(64),
    occurrences: [
      {
        occurrenceId: `migration:${input.sessionId}`,
        globalOrdinal: 0,
        segmentId: input.segmentId,
        role: "activity",
        category: input.category,
        startedAt: input.startedAt,
        completedAt: input.completedAt,
        activeSeconds: input.activeSeconds,
        movingSeconds: input.movingSeconds,
        distanceMeters: input.distanceMeters,
        timerEvents: [],
        laps: [],
      },
    ],
  };
}

async function mark(
  legacyKey: string,
  itemId: string,
  phase: "copied" | "verified" | "quarantined",
): Promise<void> {
  await withRecordingEvidenceTransaction((tx) =>
    tx
      .runAsync(
        "INSERT INTO activity_submission_migration_items (legacy_key, item_id, phase, disposition, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(legacy_key, item_id) DO UPDATE SET phase=excluded.phase, disposition=excluded.disposition, updated_at=excluded.updated_at",
        legacyKey,
        itemId,
        phase,
        phase === "quarantined" ? "terminal" : null,
        Date.now(),
      )
      .then(() => undefined),
  );
}

async function validReference(
  path: string,
  expectedSize?: number | null,
  expectedSha?: string,
): Promise<boolean> {
  // Legacy records without a digest cannot prove identity. They are intentionally retained/quarantined.
  if (
    !path ||
    !expectedSize ||
    expectedSize <= 0 ||
    expectedSize > 2_000_000_000 ||
    !/^[0-9a-f]{64}$/.test(expectedSha ?? "")
  )
    return false;
  try {
    const actual = await getLocalActivityArtifactMetadata(path);
    return actual.byteSize === expectedSize && actual.sha256 === expectedSha;
  } catch {
    return false;
  }
}

/** The old cache/path is never made authoritative: each verified item owns a documents copy. */
async function copyToDocumentAuthority(sourcePath: string, itemId: string): Promise<string> {
  const directory = new Directory(Paths.document, "activity-submission-v3");
  if (!directory.exists) directory.create({ idempotent: true });
  const destination = new File(directory, `${itemId}.fit`);
  if (!destination.exists) new File(sourcePath).copy(destination);
  return destination.uri;
}

/** Each legacy item is copied and marked independently. Legacy keys survive until every item is terminal. */
export async function migrateSingleSportLocalStateToV3Once(): Promise<void> {
  const [legacyArtifactRaw, legacyJobsRaw] = await Promise.all([
    AsyncStorage.getItem(LEGACY_PENDING_FINALIZED_ARTIFACT_KEY),
    AsyncStorage.getItem(LEGACY_ACTIVITY_SUBMISSION_QUEUE_JOBS_KEY),
  ]);
  if (!legacyArtifactRaw && !legacyJobsRaw) return;
  const { randomUUID } = await import("expo-crypto");
  if (legacyArtifactRaw) {
    try {
      const legacy = recordingSessionArtifactSchema
        .omit({ schemaVersion: true, profileId: true, executionManifest: true })
        .parse(JSON.parse(legacyArtifactRaw));
      // Artifact records do not carry a verified digest/size in this legacy format: retain rather than guess.
      await mark(LEGACY_PENDING_FINALIZED_ARTIFACT_KEY, legacy.sessionId, "quarantined");
    } catch {
      await mark(LEGACY_PENDING_FINALIZED_ARTIFACT_KEY, "unreadable", "quarantined");
    }
  }

  if (legacyJobsRaw) {
    try {
      const oldSchema = activitySubmissionQueueJobSchema.omit({
        schemaVersion: true,
        executionManifest: true,
        retryClass: true,
        nextAttemptAt: true,
        errorCategory: true,
        leaseOwner: true,
        leaseToken: true,
        leaseExpiresAt: true,
      });
      const jobs = z.array(oldSchema).parse(JSON.parse(legacyJobsRaw));
      const retained = [] as typeof jobs;
      for (const old of jobs) {
        const itemId = old.id;
        // Identity must be established from the bytes before either the destination or
        // queue row is trusted. A missing profile/session/digest remains recoverable.
        if (
          !old.draft.profileId ||
          !(old.sessionId ?? old.artifactId) ||
          !(await validReference(
            old.localActivityFilePath,
            old.localActivityFileSize,
            old.artifactSha256,
          ))
        ) {
          await mark(LEGACY_ACTIVITY_SUBMISSION_QUEUE_JOBS_KEY, itemId, "quarantined");
          retained.push(old);
          continue;
        }
        const documentPath = await copyToDocumentAuthority(old.localActivityFilePath, itemId);
        await mark(LEGACY_ACTIVITY_SUBMISSION_QUEUE_JOBS_KEY, itemId, "copied");
        // Verify the copied authority, not merely the legacy source, before queueing it.
        if (!(await validReference(documentPath, old.localActivityFileSize, old.artifactSha256))) {
          await mark(LEGACY_ACTIVITY_SUBMISSION_QUEUE_JOBS_KEY, itemId, "quarantined");
          retained.push(old);
          continue;
        }
        const converted = activitySubmissionQueueJobSchema.parse({
          ...old,
          localActivityFilePath: documentPath,
          schemaVersion: 2,
          retryClass: "none",
          executionManifest: singleSportManifest({
            segmentId: randomUUID(),
            sessionId: old.sessionId ?? old.artifactId,
            category: old.draft.activityType,
            startedAt: old.draft.startedAt,
            completedAt: old.draft.finishedAt,
            activeSeconds: old.draft.durationSeconds,
            movingSeconds: old.draft.movingSeconds,
            distanceMeters: old.draft.distanceMeters,
          }),
        });
        await upsertActivitySubmissionQueueJob(converted);
        // The durable row and verified documents copy commit before the old reference is removed.
        await mark(LEGACY_ACTIVITY_SUBMISSION_QUEUE_JOBS_KEY, itemId, "verified");
      }
      if (retained.length)
        await AsyncStorage.setItem(
          LEGACY_ACTIVITY_SUBMISSION_QUEUE_JOBS_KEY,
          JSON.stringify(retained),
        );
      else await AsyncStorage.removeItem(LEGACY_ACTIVITY_SUBMISSION_QUEUE_JOBS_KEY);
    } catch {
      await mark(LEGACY_ACTIVITY_SUBMISSION_QUEUE_JOBS_KEY, "unreadable", "quarantined");
    }
  }
  // Quarantined evidence remains at its legacy key; verified items alone are removed.
}
