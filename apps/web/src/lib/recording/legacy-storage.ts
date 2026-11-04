import {
  portableTimerRecordingDraftSchema,
  portableWebRecordingArtifactSchema,
  portableWebRecordingSubmissionJobSchema,
} from "@repo/core";
import {
  MEASURED_BATCH_SIZE,
  measuredJournalEntrySchema,
} from "@repo/core/recording/measured-journal";
import { z } from "zod";
import {
  CURRENT_CONTRACT_EPOCH_VALUE,
  LEGACY_TIMER_RECORDING_DATABASE_NAME,
  LEGACY_WEB_RECORDING_DATABASE_NAME,
  WEB_RECORDING_DATABASE_NAME,
  WEB_RECORDING_DATABASE_PREFIX,
  WEB_RECORDING_JOURNAL_DATABASE_PREFIX,
} from "../contract-epoch";
import { storedMeasuredCursorSchema } from "./measured-commit";

export type LegacyRecordingDatabase = {
  name: string;
  draft: unknown;
  leaseExpiresAtMs: number;
  artifacts: unknown[];
  jobs: unknown[];
  /** Evidence already handled by a previous migration; never resurrect it. */
  archiveOnly?: true | undefined;
};
export type LegacyRecordingArchive = {
  version: 1;
  ownerId: string;
  databases: LegacyRecordingDatabase[];
  blockedArtifactIds: string[];
};
export const legacyRecordingArchiveSchema = z
  .object({
    version: z.literal(1),
    ownerId: z.string().min(1),
    databases: z
      .array(
        z
          .object({
            name: z.string().min(1).max(200),
            draft: z.unknown(),
            leaseExpiresAtMs: z.number().finite().nonnegative(),
            artifacts: z.array(z.unknown()),
            jobs: z.array(z.unknown()),
            archiveOnly: z.literal(true).optional(),
          })
          .strict(),
      )
      .max(64),
    blockedArtifactIds: z.array(z.string().min(1)),
  })
  .strict();
const owned = (value: unknown, ownerId: string): boolean =>
  typeof value === "object" && value !== null && "ownerId" in value && value.ownerId === ownerId;
function jobOwner(value: unknown, ownerId: string): boolean {
  if (typeof value !== "object" || !value) return false;
  const job = "job" in value ? value.job : value;
  return (
    typeof job === "object" && job !== null && "artifact" in job && owned(job.artifact, ownerId)
  );
}

function compatiblePriorNamespace(name: string): boolean {
  if (name === WEB_RECORDING_DATABASE_NAME) return false;
  if (name === LEGACY_WEB_RECORDING_DATABASE_NAME) return true;
  const current = Number(CURRENT_CONTRACT_EPOCH_VALUE);
  for (const [prefix, inclusive] of [
    [WEB_RECORDING_DATABASE_PREFIX, true],
    [WEB_RECORDING_JOURNAL_DATABASE_PREFIX, false],
  ] as const) {
    if (!name.startsWith(prefix)) continue;
    const suffix = name.slice(prefix.length);
    if (!/^\d+$/.test(suffix)) return false;
    const epoch = Number(suffix);
    return (
      Number.isSafeInteger(epoch) && epoch > 0 && (inclusive ? epoch <= current : epoch < current)
    );
  }
  return false;
}

async function legacyDatabaseNames(): Promise<string[]> {
  const names = new Set([LEGACY_TIMER_RECORDING_DATABASE_NAME, LEGACY_WEB_RECORDING_DATABASE_NAME]);
  // The immediate predecessor is recoverable even where enumeration is absent.
  const previousEpoch = Number(CURRENT_CONTRACT_EPOCH_VALUE) - 1;
  if (previousEpoch > 0) names.add(`${WEB_RECORDING_JOURNAL_DATABASE_PREFIX}${previousEpoch}`);
  if (typeof indexedDB.databases === "function") {
    for (const database of await indexedDB.databases())
      if (database.name && compatiblePriorNamespace(database.name)) names.add(database.name);
  }
  return [...names].filter(compatiblePriorNamespace).sort();
}

function blockedArtifacts(
  databases: readonly LegacyRecordingDatabase[],
  inherited: readonly string[] = [],
): Set<string> {
  const blocked = new Set(inherited);
  for (const database of databases)
    for (const raw of database.jobs) {
      const job = typeof raw === "object" && raw !== null && "job" in raw ? raw.job : raw;
      const parsed = portableWebRecordingSubmissionJobSchema.safeParse(job);
      if (parsed.success) blocked.add(parsed.data.artifact.recordingSessionId);
      else if (typeof job === "object" && job !== null && "artifact" in job) {
        const artifact = portableWebRecordingArtifactSchema.safeParse(job.artifact);
        if (artifact.success) blocked.add(artifact.data.recordingSessionId);
      }
    }
  return blocked;
}
function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function openExisting(name: string): Promise<IDBDatabase | null> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    let absent = false;
    request.onupgradeneeded = () => {
      absent = true;
      request.transaction?.abort();
    };
    request.onerror = () => (absent ? resolve(null) : reject(request.error));
    request.onsuccess = () => resolve(request.result);
  });
}

/** Read only: old readers keep their original database and cannot see the new namespace. */
export async function readLegacyRecordingArchive(ownerId: string): Promise<LegacyRecordingArchive> {
  const databases: LegacyRecordingDatabase[] = [];
  const historical: LegacyRecordingDatabase[] = [];
  const handledNames = new Set<string>();
  const inheritedBlocked = new Set<string>();
  for (const name of await legacyDatabaseNames()) {
    const database = await openExisting(name);
    if (!database) continue;
    try {
      const names = [
        "timer-drafts",
        "finalized-artifacts",
        "submission-jobs",
        "measured-chunks",
        "legacy-archive",
      ].filter((store) => database.objectStoreNames.contains(store));
      if (!names.length) continue;
      const tx = database.transaction(names, "readonly");
      // Queue all requests synchronously to retain the readonly transaction.
      const draftRequest = names.includes("timer-drafts")
        ? Promise.all([
            requestValue(tx.objectStore("timer-drafts").get(`active-timer-recording:${ownerId}`)),
            requestValue(tx.objectStore("timer-drafts").get("active-timer-recording")),
          ])
        : Promise.resolve([]);
      const artifactsRequest = names.includes("finalized-artifacts")
        ? requestValue(tx.objectStore("finalized-artifacts").getAll())
        : Promise.resolve([]);
      const jobsRequest = names.includes("submission-jobs")
        ? requestValue(tx.objectStore("submission-jobs").getAll())
        : Promise.resolve([]);
      const archiveRequest = names.includes("legacy-archive")
        ? requestValue(tx.objectStore("legacy-archive").get(ownerId))
        : Promise.resolve(undefined);
      const [envelopes, artifacts, jobs, archived] = await Promise.all([
        draftRequest,
        artifactsRequest,
        jobsRequest,
        archiveRequest,
      ]);
      const ownDrafts: Array<{ draft: unknown; leaseExpiresAtMs: number }> = [];
      for (const envelope of envelopes) {
        let draft: unknown = envelope?.draft ?? envelope;
        if (!owned(draft, ownerId)) continue;
        if (envelope?.measured !== undefined) {
          if (!names.includes("measured-chunks"))
            throw new Error(
              "Prior measured chunks are unavailable; original evidence is retained.",
            );
          const timer = portableTimerRecordingDraftSchema.parse(draft);
          const cursor = storedMeasuredCursorSchema.parse(envelope.measured);
          const range = IDBKeyRange.bound(
            [ownerId, timer.sessionSnapshot.identity.sessionId, 0],
            [ownerId, timer.sessionSnapshot.identity.sessionId, cursor.cursor],
          );
          const chunks: unknown[] = await requestValue(
            tx.objectStore("measured-chunks").getAll(range),
          );
          const entries = chunks.flatMap((chunk) =>
            measuredJournalEntrySchema.array().max(MEASURED_BATCH_SIZE).parse(chunk),
          );
          if (entries.length !== cursor.cursor)
            throw new Error("Prior measured prefix is incomplete; original evidence is retained.");
          draft = portableTimerRecordingDraftSchema.parse({
            ...timer,
            measuredJournal: { ...cursor.header, entries },
          });
        }
        ownDrafts.push({
          draft,
          leaseExpiresAtMs:
            typeof envelope?.leaseExpiresAtMs === "number" &&
            Number.isFinite(envelope.leaseExpiresAtMs)
              ? envelope.leaseExpiresAtMs
              : 0,
        });
      }
      if (archived !== undefined) {
        const archive = legacyRecordingArchiveSchema.parse(archived);
        if (archive.ownerId !== ownerId)
          throw new Error("Prior archive ownership is invalid; original evidence is retained.");
        for (const id of archive.blockedArtifactIds) inheritedBlocked.add(id);
        for (const snapshot of archive.databases) {
          handledNames.add(snapshot.name);
          historical.push({ ...snapshot, archiveOnly: true });
        }
      }
      const unique = [
        ...new Map(
          ownDrafts.map((candidate) => [JSON.stringify(candidate.draft), candidate]),
        ).values(),
      ];
      const draft =
        unique.length > 1 ? unique.map((candidate) => candidate.draft) : (unique[0]?.draft ?? null);
      const matchingArtifacts: unknown[] = artifacts.filter((value: unknown) =>
        owned(value, ownerId),
      );
      const matchingJobs: unknown[] = jobs.filter((value: unknown) => jobOwner(value, ownerId));
      if (draft || matchingArtifacts.length || matchingJobs.length)
        databases.push({
          name,
          draft,
          leaseExpiresAtMs: Math.max(0, ...unique.map((candidate) => candidate.leaseExpiresAtMs)),
          artifacts: matchingArtifacts,
          jobs: matchingJobs,
        });
    } finally {
      database.close();
    }
  }
  const snapshots = [
    ...databases.map((database) =>
      handledNames.has(database.name) ? { ...database, archiveOnly: true as const } : database,
    ),
    ...historical,
  ];
  // Repeated inherited backups should not multiply on each epoch transition.
  const unique = [
    ...new Map(snapshots.map((database) => [JSON.stringify(database), database])).values(),
  ];
  return legacyRecordingArchiveSchema.parse({
    version: 1,
    ownerId,
    databases: unique,
    blockedArtifactIds: [...blockedArtifacts(unique, [...inheritedBlocked])],
  });
}

export function prepareLegacyRecordingCopy(archive: LegacyRecordingArchive, nowMs: number) {
  if (
    archive.databases.some(
      (database) => !database.archiveOnly && database.draft && database.leaseExpiresAtMs > nowMs,
    )
  )
    throw new Error(
      "Close older recorder tabs and wait for their 45-second lease to expire before copying recovery data. Originals are retained.",
    );
  const drafts = archive.databases.flatMap((database) => {
    if (!database.draft || database.archiveOnly) return [];
    const parsed = portableTimerRecordingDraftSchema.safeParse(database.draft);
    if (!parsed.success)
      throw new Error(
        "An older recording cannot be validated. Download the retained legacy archive for recovery; it has not been deleted.",
      );
    return [parsed.data];
  });
  if (drafts.length > 1)
    throw new Error(
      "Multiple older drafts require review. Download the retained legacy archive; no draft was chosen or deleted.",
    );
  const blocked = blockedArtifacts(archive.databases, archive.blockedArtifactIds);
  const artifacts = archive.databases.flatMap((database) =>
    database.archiveOnly
      ? []
      : database.artifacts.flatMap((raw) => {
          const parsed = portableWebRecordingArtifactSchema.safeParse(raw);
          return parsed.success && !blocked.has(parsed.data.recordingSessionId)
            ? [parsed.data]
            : [];
        }),
  );
  return { draft: drafts[0] ?? null, artifacts };
}
