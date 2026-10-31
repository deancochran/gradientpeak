import {
  type PortableTimerRecordingDraft,
  type PortableWebRecordingArtifact,
  type PortableWebRecordingSubmissionJob,
  portableTimerRecordingDraftSchema,
  portableWebRecordingArtifactSchema,
  portableWebRecordingSubmissionJobSchema,
} from "@repo/core";
import {
  closeMeasuredWindow,
  emptyMeasuredJournal,
  MEASURED_BATCH_SIZE,
  type MeasuredJournalBatch,
  type MeasuredRecordingJournal,
  measuredJournalEntrySchema,
} from "@repo/core/recording/measured-journal";
import { WEB_RECORDING_DATABASE_NAME } from "../contract-epoch";
import {
  type LegacyRecordingArchive,
  legacyRecordingArchiveSchema,
  prepareLegacyRecordingCopy,
  readLegacyRecordingArchive,
} from "./legacy-storage";
import {
  nextMeasuredCursor,
  type StoredMeasuredCursor,
  storedMeasuredCursorSchema,
} from "./measured-commit";

import {
  type ClaimedWebRecordingSubmissionJob,
  createQueuedSubmissionJob,
  type SubmissionJobClaim,
} from "./submission-queue";
import { createTimerOnlyRecordingDraft, type TimerOnlyRecordingState } from "./timer-runtime";

export interface TimerDraftStorage {
  load(): Promise<unknown>;
  save(draft: PortableTimerRecordingDraft): Promise<void>;
  remove(): Promise<void>;
}

export interface WebRecordingStorage extends TimerDraftStorage {
  appendMeasuredCheckpoint(
    draft: PortableTimerRecordingDraft,
    batch: MeasuredJournalBatch,
  ): Promise<number>;
  getLegacyArchive(): Promise<LegacyRecordingArchive | null>;
  takeOver(): Promise<void>;
  finalize(artifact: PortableWebRecordingArtifact): Promise<void>;
  loadLatestArtifact(): Promise<PortableWebRecordingArtifact | null>;
  listArtifacts(): Promise<PortableWebRecordingArtifact[]>;
  enqueueSubmission(
    artifact: PortableWebRecordingArtifact,
    now: string,
  ): Promise<PortableWebRecordingSubmissionJob>;
  getSubmissionJob(id: string): Promise<PortableWebRecordingSubmissionJob | null>;
  listDueSubmissionJobs(now: string): Promise<PortableWebRecordingSubmissionJob[]>;
  claimSubmissionJob(id: string, now: string): Promise<ClaimedWebRecordingSubmissionJob | null>;
  markSubmissionJobRetry(
    id: string,
    claim: SubmissionJobClaim,
    now: string,
    nextAttemptAt: string,
    reason: string,
    activityId?: string | null,
  ): Promise<PortableWebRecordingSubmissionJob | null>;
  markSubmissionJobReviewRequired(
    id: string,
    claim: SubmissionJobClaim,
    now: string,
    activityId: string,
    reason: string,
  ): Promise<PortableWebRecordingSubmissionJob | null>;
  markSubmissionJobSubmitted(
    id: string,
    claim: SubmissionJobClaim,
    now: string,
    activityId: string,
  ): Promise<PortableWebRecordingSubmissionJob | null>;
  markSubmissionJobIngestionClaimed(
    id: string,
    claim: SubmissionJobClaim,
    now: string,
    ingestionId: string,
  ): Promise<PortableWebRecordingSubmissionJob | null>;
  retrySubmissionNow(id: string, now: string): Promise<PortableWebRecordingSubmissionJob>;
  discardArtifact(id: string): Promise<boolean>;
}

export type TimerDraftLoadResult =
  | { status: "empty"; draft: null }
  | { status: "valid"; draft: PortableTimerRecordingDraft }
  | { status: "discarded-invalid"; draft: null };

export async function loadTimerDraft(
  storage: TimerDraftStorage,
  ownerId: string,
): Promise<TimerDraftLoadResult> {
  const untrustedDraft = await storage.load();
  if (untrustedDraft === null || untrustedDraft === undefined) {
    return { status: "empty", draft: null };
  }

  const parsedDraft = portableTimerRecordingDraftSchema.safeParse(untrustedDraft);
  if (
    !parsedDraft.success &&
    typeof untrustedDraft === "object" &&
    untrustedDraft !== null &&
    "sessionSnapshot" in untrustedDraft
  ) {
    throw new UnsupportedRecordingContractError();
  }
  if (
    !parsedDraft.success &&
    typeof untrustedDraft === "object" &&
    untrustedDraft !== null &&
    "measuredJournal" in untrustedDraft
  ) {
    throw new Error(
      "Saved measured evidence could not be validated and has been retained for recovery.",
    );
  }
  if (!parsedDraft.success || parsedDraft.data.ownerId !== ownerId) {
    await storage.remove();
    return { status: "discarded-invalid", draft: null };
  }

  return { status: "valid", draft: parsedDraft.data };
}

export async function checkpointTimerDraft(
  storage: TimerDraftStorage,
  state: TimerOnlyRecordingState,
  nowMs: number,
  ownerId: string,
  measuredJournal?: MeasuredRecordingJournal,
): Promise<void> {
  const draft = createTimerOnlyRecordingDraft(state, nowMs, ownerId);
  if (draft) {
    await storage.save(measuredJournal ? { ...draft, measuredJournal } : draft);
    return;
  }

  await storage.remove();
}

export const TIMER_DRAFT_DATABASE_NAME = WEB_RECORDING_DATABASE_NAME;
export const TIMER_DRAFT_DATABASE_VERSION = 1;
const TIMER_DRAFT_STORE_NAME = "timer-drafts";
const FINALIZED_ARTIFACT_STORE_NAME = "finalized-artifacts";
const SUBMISSION_JOB_STORE_NAME = "submission-jobs";
const MEASURED_CHUNK_STORE_NAME = "measured-chunks";
const LEGACY_ARCHIVE_STORE_NAME = "legacy-archive";
export const TIMER_DRAFT_STORAGE_KEY = "active-timer-recording";
const TIMER_DRAFT_LEASE_MS = 45_000;
const SUBMISSION_JOB_LEASE_MS = 45_000;

type StoredTimerDraftEnvelope = {
  ownerId: string;
  draft: PortableTimerRecordingDraft | null;
  leaseOwner: string | null;
  leaseExpiresAtMs: number;
  measured?: StoredMeasuredCursor;
};

export type StoredSubmissionJobEnvelope = {
  job: PortableWebRecordingSubmissionJob;
  claimOwner: string | null;
  claimExpiresAtMs: number;
  revision: number;
};

export class TimerDraftStorageUnavailableError extends Error {}
export class TimerDraftStorageInUseError extends Error {}
export class LegacyRecordingRecoveryRequiredError extends TimerDraftStorageInUseError {}
export class RecordingSubmissionOverwriteError extends Error {}
/** The original stored bytes are the quarantine: never clear or reinterpret them. */
export class UnsupportedRecordingContractError extends Error {
  constructor() {
    super(
      "Saved recording data uses an unsupported contract and has been retained for recovery. Use the previous app version to export it before explicitly clearing local recording data; new recording and upload are blocked here.",
    );
    this.name = "UnsupportedRecordingContractError";
  }
}

export function parseStoredSubmissionJobEnvelope(
  value: unknown,
  ownerId: string,
): StoredSubmissionJobEnvelope | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const envelope = value as Record<string, unknown>;
  const parsed = portableWebRecordingSubmissionJobSchema.safeParse(envelope.job);
  if (
    !parsed.success &&
    typeof envelope.job === "object" &&
    envelope.job !== null &&
    "artifact" in envelope.job
  ) {
    const artifact = envelope.job.artifact;
    if (
      typeof artifact === "object" &&
      artifact !== null &&
      "ownerId" in artifact &&
      artifact.ownerId === ownerId
    )
      throw new UnsupportedRecordingContractError();
  }
  if (!parsed.success || parsed.data.artifact.ownerId !== ownerId) return null;
  const claimExpiresAtMs = envelope.claimExpiresAtMs;
  const revision = envelope.revision;
  if (
    (envelope.claimOwner !== null && typeof envelope.claimOwner !== "string") ||
    typeof claimExpiresAtMs !== "number" ||
    !Number.isSafeInteger(claimExpiresAtMs) ||
    claimExpiresAtMs < 0 ||
    typeof revision !== "number" ||
    !Number.isSafeInteger(revision) ||
    revision < 0
  ) {
    return null;
  }
  return {
    job: parsed.data,
    claimOwner: envelope.claimOwner,
    claimExpiresAtMs,
    revision,
  };
}

export function claimSubmissionJobEnvelope({
  envelope,
  instanceId,
  nowMs,
}: {
  envelope: StoredSubmissionJobEnvelope;
  instanceId: string;
  nowMs: number;
}): StoredSubmissionJobEnvelope | null {
  const due =
    envelope.job.status === "queued" ||
    (envelope.job.status === "retry_wait" &&
      (!envelope.job.nextAttemptAt || Date.parse(envelope.job.nextAttemptAt) <= nowMs));
  const expiredSubmitting =
    envelope.job.status === "submitting" && envelope.claimExpiresAtMs <= nowMs;
  if (!due && !expiredSubmitting) return null;
  return {
    ...envelope,
    job: {
      ...envelope.job,
      status: "submitting",
      updatedAt: new Date(nowMs).toISOString(),
      nextAttemptAt: null,
    },
    claimOwner: instanceId,
    claimExpiresAtMs: nowMs + SUBMISSION_JOB_LEASE_MS,
    revision: envelope.revision + 1,
  };
}

export function finalizeClaimedSubmissionJobEnvelope({
  envelope,
  claim,
  update,
}: {
  envelope: StoredSubmissionJobEnvelope;
  claim: SubmissionJobClaim;
  nowMs: number;
  update: (job: PortableWebRecordingSubmissionJob) => PortableWebRecordingSubmissionJob;
}): StoredSubmissionJobEnvelope | null {
  if (
    envelope.job.status !== "submitting" ||
    envelope.claimOwner !== claim.owner ||
    envelope.revision !== claim.revision
  ) {
    return null;
  }
  return {
    job: portableWebRecordingSubmissionJobSchema.parse(update(envelope.job)),
    claimOwner: null,
    claimExpiresAtMs: 0,
    revision: envelope.revision + 1,
  };
}

export function checkpointClaimedSubmissionJobEnvelope({
  envelope,
  claim,
  update,
}: {
  envelope: StoredSubmissionJobEnvelope;
  claim: SubmissionJobClaim;
  update: (job: PortableWebRecordingSubmissionJob) => PortableWebRecordingSubmissionJob;
}): StoredSubmissionJobEnvelope | null {
  if (
    envelope.job.status !== "submitting" ||
    envelope.claimOwner !== claim.owner ||
    envelope.revision !== claim.revision
  ) {
    return null;
  }
  return {
    ...envelope,
    job: portableWebRecordingSubmissionJobSchema.parse(update(envelope.job)),
  };
}

export function isSameSubmissionArtifact(
  left: PortableWebRecordingArtifact,
  right: PortableWebRecordingArtifact,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function canStoreSubmissionArtifact({
  existingArtifact,
  existingJob,
  artifact,
}: {
  existingArtifact: PortableWebRecordingArtifact | null;
  existingJob: StoredSubmissionJobEnvelope | null;
  artifact: PortableWebRecordingArtifact;
}): boolean {
  if (!existingJob) return true;
  return (
    isSameSubmissionArtifact(existingJob.job.artifact, artifact) &&
    (!existingArtifact || isSameSubmissionArtifact(existingArtifact, artifact))
  );
}

export function canDiscardSubmissionJob(job: StoredSubmissionJobEnvelope | null): boolean {
  return job?.job.status !== "submitted" && job?.job.status !== "submitting";
}

export function isTimerDraftLeaseAvailable({
  leaseOwner,
  leaseExpiresAtMs,
  instanceId,
  nowMs,
}: {
  leaseOwner: string | null | undefined;
  leaseExpiresAtMs: number | undefined;
  instanceId: string;
  nowMs: number;
}): boolean {
  return !leaseOwner || leaseOwner === instanceId || (leaseExpiresAtMs ?? 0) <= nowMs;
}

export class IndexedDbTimerDraftStorage implements WebRecordingStorage {
  private readonly storageKey: string;

  constructor(
    private readonly ownerId: string,
    private readonly instanceId: string,
    private readonly now: () => number = Date.now,
  ) {
    this.storageKey = `${TIMER_DRAFT_STORAGE_KEY}:${ownerId}`;
  }

  async load(): Promise<unknown> {
    const database = await this.openDatabase();

    try {
      const transaction = database.transaction(
        [TIMER_DRAFT_STORE_NAME, MEASURED_CHUNK_STORE_NAME],
        "readwrite",
      );
      const store = transaction.objectStore(TIMER_DRAFT_STORE_NAME);
      const stored = (await requestResult(store.get(this.storageKey))) as
        | StoredTimerDraftEnvelope
        | undefined;
      const ownedDraft = stored?.ownerId === this.ownerId ? stored.draft : null;
      const parsedDraft = portableTimerRecordingDraftSchema.safeParse(ownedDraft);
      if (ownedDraft && !parsedDraft.success && isRecordingDraft(ownedDraft)) {
        transaction.abort();
        throw new UnsupportedRecordingContractError();
      }
      // A record under another profile's key is neither ours to inspect nor to replace.
      // Do not acquire a lease over it merely because this storage instance was opened.
      if (stored && stored.ownerId !== this.ownerId) {
        transaction.abort();
        return null;
      }
      const nowMs = this.now();
      if (
        !isTimerDraftLeaseAvailable({
          leaseOwner: stored?.leaseOwner,
          leaseExpiresAtMs: stored?.leaseExpiresAtMs,
          instanceId: this.instanceId,
          nowMs,
        })
      ) {
        transaction.abort();
        throw new TimerDraftStorageInUseError("This timer recording is active in another tab.");
      }

      const envelope: StoredTimerDraftEnvelope = {
        ownerId: this.ownerId,
        draft: ownedDraft,
        leaseOwner: this.instanceId,
        leaseExpiresAtMs: nowMs + TIMER_DRAFT_LEASE_MS,
        ...(stored?.measured ? { measured: stored.measured } : {}),
      };
      store.put(envelope, this.storageKey);
      let draft = parsedDraft.success ? parsedDraft.data : envelope.draft;
      if (parsedDraft.success && draft && envelope.measured) {
        const metadata = storedMeasuredCursorSchema.parse(envelope.measured);
        const chunks = await requestResult(
          databaseChunkRange(
            transaction,
            this.ownerId,
            parsedDraft.data.sessionSnapshot.identity.sessionId,
            metadata.cursor,
          ),
        );
        const entries: MeasuredRecordingJournal["entries"] = chunks.flatMap((chunk: unknown) => {
          if (!Array.isArray(chunk)) throw new Error("Invalid measured chunk; evidence retained.");
          return measuredJournalEntrySchema.array().max(128).parse(chunk);
        });
        if (entries.length !== metadata.cursor)
          throw new Error("Measured committed prefix is incomplete; evidence retained.");
        draft = portableTimerRecordingDraftSchema.parse({
          ...draft,
          measuredJournal: { ...metadata.header, entries },
        });
      }
      await transactionComplete(transaction);
      if (!draft && !(await this.protectedLegacyArchive())) {
        const legacy = await readLegacyRecordingArchive(this.ownerId);
        if (legacy.databases.length)
          throw new LegacyRecordingRecoveryRequiredError(
            "Older recorder data is available. Close old recorder tabs, then use Take over recording to copy recovery data into isolated storage. Originals and legacy submissions are retained; legacy submissions are not restarted.",
          );
      }
      return draft;
    } catch (error) {
      if (error instanceof TimerDraftStorageInUseError) throw error;
      throw error;
    } finally {
      database.close();
    }
  }

  async takeOver(): Promise<void> {
    if (!(await this.protectedLegacyArchive()) && !(await this.hasCurrentDraft())) {
      const legacy = await readLegacyRecordingArchive(this.ownerId);
      if (legacy.databases.length) {
        await this.copyLegacyArchive(legacy);
        return;
      }
    }
    const database = await this.openDatabase();
    try {
      const transaction = database.transaction(TIMER_DRAFT_STORE_NAME, "readwrite");
      const store = transaction.objectStore(TIMER_DRAFT_STORE_NAME);
      const stored = (await requestResult(store.get(this.storageKey))) as
        | StoredTimerDraftEnvelope
        | undefined;
      const nowMs = this.now();
      store.put(
        {
          ownerId: this.ownerId,
          draft: stored?.ownerId === this.ownerId ? stored.draft : null,
          leaseOwner: this.instanceId,
          leaseExpiresAtMs: nowMs + TIMER_DRAFT_LEASE_MS,
          ...(stored?.measured ? { measured: stored.measured } : {}),
        } satisfies StoredTimerDraftEnvelope,
        this.storageKey,
      );
      await transactionComplete(transaction);
    } finally {
      database.close();
    }
  }

  async save(draft: PortableTimerRecordingDraft): Promise<void> {
    const validatedDraft = portableTimerRecordingDraftSchema.parse(draft);
    if (validatedDraft.measuredJournal?.entries.length)
      throw new Error("Measured checkpoints must use bounded append batches.");
    if (validatedDraft.ownerId !== this.ownerId) {
      throw new Error("Timer recording owner does not match storage owner.");
    }
    const database = await this.openDatabase();

    try {
      const transaction = database.transaction(TIMER_DRAFT_STORE_NAME, "readwrite");
      const store = transaction.objectStore(TIMER_DRAFT_STORE_NAME);
      const stored = (await requestResult(store.get(this.storageKey))) as
        | StoredTimerDraftEnvelope
        | undefined;
      const nowMs = this.now();
      if (stored?.measured)
        throw new Error("An append-only recording requires a measured checkpoint.");
      if (stored?.draft && !portableTimerRecordingDraftSchema.safeParse(stored.draft).success)
        throw new UnsupportedRecordingContractError();
      if (
        !isTimerDraftLeaseAvailable({
          leaseOwner: stored?.leaseOwner,
          leaseExpiresAtMs: stored?.leaseExpiresAtMs,
          instanceId: this.instanceId,
          nowMs,
        })
      ) {
        transaction.abort();
        throw new TimerDraftStorageInUseError("Timer recording ownership belongs to another tab.");
      }

      store.put(
        {
          ownerId: this.ownerId,
          draft: validatedDraft,
          leaseOwner: this.instanceId,
          leaseExpiresAtMs: nowMs + TIMER_DRAFT_LEASE_MS,
        } satisfies StoredTimerDraftEnvelope,
        this.storageKey,
      );
      await transactionComplete(transaction);
    } finally {
      database.close();
    }
  }

  async appendMeasuredCheckpoint(
    draft: PortableTimerRecordingDraft,
    batch: MeasuredJournalBatch,
  ): Promise<number> {
    if (draft.measuredJournal !== undefined)
      throw new Error("Append checkpoints must not contain the full measured journal.");
    const timer = portableTimerRecordingDraftSchema.parse(draft);
    if (timer.ownerId !== this.ownerId)
      throw new Error("Timer recording owner does not match storage owner.");
    const database = await this.openDatabase();
    const transaction = database.transaction(
      [TIMER_DRAFT_STORE_NAME, MEASURED_CHUNK_STORE_NAME],
      "readwrite",
    );
    const complete = transactionComplete(transaction);
    try {
      const store = transaction.objectStore(TIMER_DRAFT_STORE_NAME);
      const stored = (await requestResult(store.get(this.storageKey))) as
        | StoredTimerDraftEnvelope
        | undefined;
      if (stored?.draft && !portableTimerRecordingDraftSchema.safeParse(stored.draft).success)
        throw new UnsupportedRecordingContractError();
      if (
        !isTimerDraftLeaseAvailable({
          leaseOwner: stored?.leaseOwner,
          leaseExpiresAtMs: stored?.leaseExpiresAtMs,
          instanceId: this.instanceId,
          nowMs: this.now(),
        })
      )
        throw new TimerDraftStorageInUseError("Recording ownership belongs to another tab.");
      const sameSession =
        stored?.draft?.sessionSnapshot.identity.sessionId ===
        timer.sessionSnapshot.identity.sessionId;
      if (stored?.draft && !sameSession)
        throw new Error("An active recording cannot be replaced by a different session.");
      if (
        stored?.draft &&
        Date.parse(stored.draft.timing.updatedAt) > Date.parse(timer.timing.updatedAt)
      )
        throw new Error("An older checkpoint cannot replace a newer committed prefix.");
      const previous =
        sameSession && stored?.measured ? storedMeasuredCursorSchema.parse(stored.measured) : null;
      const measured = nextMeasuredCursor(
        previous,
        batch,
        timer.timing.startedAt,
        timer.timing.updatedAt,
        timer.lifecycle === "paused",
      );
      if (batch.entries.length) {
        transaction
          .objectStore(MEASURED_CHUNK_STORE_NAME)
          .add(batch.entries, [
            this.ownerId,
            timer.sessionSnapshot.identity.sessionId,
            batch.expectedCursor + 1,
          ]);
      }
      store.put(
        {
          ownerId: this.ownerId,
          draft: timer,
          measured,
          leaseOwner: this.instanceId,
          leaseExpiresAtMs: this.now() + TIMER_DRAFT_LEASE_MS,
        } satisfies StoredTimerDraftEnvelope,
        this.storageKey,
      );
      await complete;
      return measured.cursor;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        /* A completed/aborted transaction cannot be aborted twice. */
      }
      await complete.catch(() => undefined);
      throw error;
    } finally {
      database.close();
    }
  }

  async remove(): Promise<void> {
    const database = await this.openDatabase();

    try {
      const transaction = database.transaction(
        [TIMER_DRAFT_STORE_NAME, MEASURED_CHUNK_STORE_NAME],
        "readwrite",
      );
      const store = transaction.objectStore(TIMER_DRAFT_STORE_NAME);
      const stored = (await requestResult(store.get(this.storageKey))) as
        | StoredTimerDraftEnvelope
        | undefined;
      if (
        !isTimerDraftLeaseAvailable({
          leaseOwner: stored?.leaseOwner,
          leaseExpiresAtMs: stored?.leaseExpiresAtMs,
          instanceId: this.instanceId,
          nowMs: this.now(),
        })
      ) {
        transaction.abort();
        throw new TimerDraftStorageInUseError("Timer recording ownership was lost.");
      }

      if (stored?.draft)
        transaction
          .objectStore(MEASURED_CHUNK_STORE_NAME)
          .delete(measuredKeyRange(this.ownerId, stored.draft.sessionSnapshot.identity.sessionId));

      store.put(
        {
          ownerId: this.ownerId,
          draft: null,
          leaseOwner: null,
          leaseExpiresAtMs: 0,
        } satisfies StoredTimerDraftEnvelope,
        this.storageKey,
      );
      await transactionComplete(transaction);
    } finally {
      database.close();
    }
  }

  async finalize(artifact: PortableWebRecordingArtifact): Promise<void> {
    const validatedArtifact = this.validateArtifactOwner(artifact);
    const database = await this.openDatabase();
    try {
      const transaction = database.transaction(
        [
          TIMER_DRAFT_STORE_NAME,
          FINALIZED_ARTIFACT_STORE_NAME,
          SUBMISSION_JOB_STORE_NAME,
          MEASURED_CHUNK_STORE_NAME,
        ],
        "readwrite",
      );
      const draftStore = transaction.objectStore(TIMER_DRAFT_STORE_NAME);
      const artifactStore = transaction.objectStore(FINALIZED_ARTIFACT_STORE_NAME);
      const jobStore = transaction.objectStore(SUBMISSION_JOB_STORE_NAME);
      const stored = (await requestResult(draftStore.get(this.storageKey))) as
        | StoredTimerDraftEnvelope
        | undefined;
      this.assertLease(stored);
      if (
        stored?.measured &&
        (validatedArtifact.measuredJournal?.entries.length ?? 0) !== stored.measured.cursor
      )
        throw new Error("Measured notifications must be committed before finalization.");
      const existingArtifact = this.parseOwnedArtifact(
        await requestResult(artifactStore.get(validatedArtifact.recordingSessionId)),
      );
      const existingJob = parseStoredSubmissionJobEnvelope(
        await requestResult(jobStore.get(validatedArtifact.recordingSessionId)),
        this.ownerId,
      );
      if (
        !canStoreSubmissionArtifact({ existingArtifact, existingJob, artifact: validatedArtifact })
      ) {
        transaction.abort();
        throw new RecordingSubmissionOverwriteError(
          "A saved recording artifact cannot be replaced locally.",
        );
      }
      artifactStore.put(validatedArtifact, validatedArtifact.recordingSessionId);
      transaction
        .objectStore(MEASURED_CHUNK_STORE_NAME)
        .delete(measuredKeyRange(this.ownerId, validatedArtifact.recordingSessionId));
      draftStore.put(
        {
          ownerId: this.ownerId,
          draft: null,
          leaseOwner: null,
          leaseExpiresAtMs: 0,
        } satisfies StoredTimerDraftEnvelope,
        this.storageKey,
      );
      await transactionComplete(transaction);
    } finally {
      database.close();
    }
  }

  async loadLatestArtifact(): Promise<PortableWebRecordingArtifact | null> {
    const artifacts = await this.listArtifacts();
    const archived = await this.protectedLegacyArchive();
    for (const artifact of artifacts) {
      if (archived?.blockedArtifactIds.includes(artifact.recordingSessionId)) continue;
      const job = await this.getSubmissionJob(artifact.recordingSessionId);
      if (job?.status !== "submitted") return artifact;
    }
    return null;
  }

  async listArtifacts(): Promise<PortableWebRecordingArtifact[]> {
    const database = await this.openDatabase();
    try {
      const transaction = database.transaction(FINALIZED_ARTIFACT_STORE_NAME, "readonly");
      const values = (await requestResult(
        transaction.objectStore(FINALIZED_ARTIFACT_STORE_NAME).getAll(),
      )) as unknown[];
      await transactionComplete(transaction);
      return values
        .flatMap((value) => {
          const parsed = portableWebRecordingArtifactSchema.safeParse(value);
          if (
            !parsed.success &&
            typeof value === "object" &&
            value !== null &&
            "ownerId" in value &&
            value.ownerId === this.ownerId
          )
            throw new UnsupportedRecordingContractError();
          return parsed.success && parsed.data.ownerId === this.ownerId ? [parsed.data] : [];
        })
        .sort((left, right) => Date.parse(right.finishedAt) - Date.parse(left.finishedAt));
    } finally {
      database.close();
    }
  }

  async enqueueSubmission(
    artifact: PortableWebRecordingArtifact,
    now: string,
  ): Promise<PortableWebRecordingSubmissionJob> {
    const validatedArtifact = this.validateArtifactOwner(artifact);
    if (
      (await this.protectedLegacyArchive())?.blockedArtifactIds.includes(
        artifact.recordingSessionId,
      )
    )
      throw new RecordingSubmissionOverwriteError(
        "A legacy submission is retained read-only and cannot be restarted automatically. Download its archive for review.",
      );
    const database = await this.openDatabase();
    try {
      const transaction = database.transaction(
        [FINALIZED_ARTIFACT_STORE_NAME, SUBMISSION_JOB_STORE_NAME],
        "readwrite",
      );
      const artifactStore = transaction.objectStore(FINALIZED_ARTIFACT_STORE_NAME);
      const jobStore = transaction.objectStore(SUBMISSION_JOB_STORE_NAME);
      const existing = parseStoredSubmissionJobEnvelope(
        await requestResult(jobStore.get(validatedArtifact.recordingSessionId)),
        this.ownerId,
      );
      const existingArtifact = this.parseOwnedArtifact(
        await requestResult(artifactStore.get(validatedArtifact.recordingSessionId)),
      );
      if (
        !canStoreSubmissionArtifact({
          existingArtifact,
          existingJob: existing,
          artifact: validatedArtifact,
        })
      ) {
        transaction.abort();
        throw new RecordingSubmissionOverwriteError(
          "A saved recording submission cannot be replaced locally.",
        );
      }
      if (existing) {
        await transactionComplete(transaction);
        return existing.job;
      }
      const job = createQueuedSubmissionJob(validatedArtifact, now);
      artifactStore.put(validatedArtifact, validatedArtifact.recordingSessionId);
      jobStore.put(this.createSubmissionJobEnvelope(job), job.id);
      await transactionComplete(transaction);
      return job;
    } finally {
      database.close();
    }
  }

  async getSubmissionJob(id: string): Promise<PortableWebRecordingSubmissionJob | null> {
    const database = await this.openDatabase();
    try {
      const transaction = database.transaction(SUBMISSION_JOB_STORE_NAME, "readonly");
      const value = await requestResult(transaction.objectStore(SUBMISSION_JOB_STORE_NAME).get(id));
      await transactionComplete(transaction);
      return parseStoredSubmissionJobEnvelope(value, this.ownerId)?.job ?? null;
    } finally {
      database.close();
    }
  }

  async listDueSubmissionJobs(now: string): Promise<PortableWebRecordingSubmissionJob[]> {
    const database = await this.openDatabase();
    try {
      const transaction = database.transaction(SUBMISSION_JOB_STORE_NAME, "readonly");
      const values = (await requestResult(
        transaction.objectStore(SUBMISSION_JOB_STORE_NAME).getAll(),
      )) as unknown[];
      await transactionComplete(transaction);
      const nowMs = Date.parse(now);
      return values
        .map((value) => parseStoredSubmissionJobEnvelope(value, this.ownerId)?.job ?? null)
        .filter(
          (job): job is PortableWebRecordingSubmissionJob =>
            Boolean(job) &&
            job?.status !== "submitted" &&
            job?.status !== "review_required" &&
            (job?.status === "submitting" ||
              !job?.nextAttemptAt ||
              Date.parse(job.nextAttemptAt) <= nowMs),
        );
    } finally {
      database.close();
    }
  }

  async claimSubmissionJob(
    id: string,
    now: string,
  ): Promise<ClaimedWebRecordingSubmissionJob | null> {
    const database = await this.openDatabase();
    try {
      const transaction = database.transaction(SUBMISSION_JOB_STORE_NAME, "readwrite");
      const store = transaction.objectStore(SUBMISSION_JOB_STORE_NAME);
      const current = parseStoredSubmissionJobEnvelope(
        await requestResult(store.get(id)),
        this.ownerId,
      );
      if (!current) {
        await transactionComplete(transaction);
        return null;
      }
      const claimed = claimSubmissionJobEnvelope({
        envelope: current,
        instanceId: this.instanceId,
        nowMs: Date.parse(now),
      });
      if (!claimed) {
        await transactionComplete(transaction);
        return null;
      }
      store.put(claimed, id);
      await transactionComplete(transaction);
      const claimOwner = claimed.claimOwner;
      if (!claimOwner) throw new Error("Claimed submission job is missing its owner.");
      return {
        ...claimed.job,
        claim: { owner: claimOwner, revision: claimed.revision },
      };
    } finally {
      database.close();
    }
  }

  async markSubmissionJobRetry(
    id: string,
    claim: SubmissionJobClaim,
    now: string,
    nextAttemptAt: string,
    reason: string,
    activityId: string | null = null,
  ): Promise<PortableWebRecordingSubmissionJob | null> {
    return this.updateClaimedJob(id, claim, now, (job) => ({
      ...job,
      status: "retry_wait",
      attempts: job.attempts + 1,
      updatedAt: now,
      nextAttemptAt,
      lastError: reason,
      activityId: activityId ?? job.activityId,
    }));
  }

  async markSubmissionJobIngestionClaimed(
    id: string,
    claim: SubmissionJobClaim,
    now: string,
    ingestionId: string,
  ): Promise<PortableWebRecordingSubmissionJob | null> {
    return this.checkpointClaimedJob(id, claim, (job) => {
      if (job.ingestionId && job.ingestionId !== ingestionId) {
        throw new RecordingSubmissionOverwriteError(
          "A recording upload claim cannot change during retry.",
        );
      }
      return { ...job, ingestionId, updatedAt: now };
    });
  }

  async markSubmissionJobSubmitted(
    id: string,
    claim: SubmissionJobClaim,
    now: string,
    activityId: string,
  ): Promise<PortableWebRecordingSubmissionJob | null> {
    return this.updateClaimedJob(id, claim, now, (job) => ({
      ...job,
      status: "submitted",
      attempts: job.attempts + 1,
      updatedAt: now,
      nextAttemptAt: null,
      lastError: null,
      activityId,
    }));
  }

  async markSubmissionJobReviewRequired(
    id: string,
    claim: SubmissionJobClaim,
    now: string,
    activityId: string,
    reason: string,
  ): Promise<PortableWebRecordingSubmissionJob | null> {
    return this.updateClaimedJob(id, claim, now, (job) => ({
      ...job,
      status: "review_required",
      attempts: job.attempts + 1,
      updatedAt: now,
      nextAttemptAt: null,
      lastError: reason,
      activityId,
    }));
  }

  async retrySubmissionNow(id: string, now: string): Promise<PortableWebRecordingSubmissionJob> {
    return this.updateJob(id, (job) => {
      if (job.status !== "retry_wait") {
        throw new RecordingSubmissionOverwriteError("Only a waiting submission can be retried.");
      }
      return {
        ...job,
        status: "queued",
        updatedAt: now,
        nextAttemptAt: null,
        lastError: null,
      };
    });
  }

  async discardArtifact(id: string): Promise<boolean> {
    const database = await this.openDatabase();
    try {
      const transaction = database.transaction(
        [FINALIZED_ARTIFACT_STORE_NAME, SUBMISSION_JOB_STORE_NAME],
        "readwrite",
      );
      const artifactStore = transaction.objectStore(FINALIZED_ARTIFACT_STORE_NAME);
      const jobStore = transaction.objectStore(SUBMISSION_JOB_STORE_NAME);
      const job = parseStoredSubmissionJobEnvelope(
        await requestResult(jobStore.get(id)),
        this.ownerId,
      );
      if (!canDiscardSubmissionJob(job)) {
        await transactionComplete(transaction);
        return false;
      }
      artifactStore.delete(id);
      jobStore.delete(id);
      await transactionComplete(transaction);
      return true;
    } finally {
      database.close();
    }
  }

  private async updateJob(
    id: string,
    update: (job: PortableWebRecordingSubmissionJob) => PortableWebRecordingSubmissionJob,
  ): Promise<PortableWebRecordingSubmissionJob> {
    const database = await this.openDatabase();
    try {
      const transaction = database.transaction(SUBMISSION_JOB_STORE_NAME, "readwrite");
      const store = transaction.objectStore(SUBMISSION_JOB_STORE_NAME);
      const current = parseStoredSubmissionJobEnvelope(
        await requestResult(store.get(id)),
        this.ownerId,
      );
      if (!current || current.claimOwner) {
        transaction.abort();
        throw new Error("Recording submission job was not found.");
      }
      const next = portableWebRecordingSubmissionJobSchema.parse(update(current.job));
      store.put({ ...current, job: next, revision: current.revision + 1 }, id);
      await transactionComplete(transaction);
      return next;
    } finally {
      database.close();
    }
  }

  private async updateClaimedJob(
    id: string,
    claim: SubmissionJobClaim,
    now: string,
    update: (job: PortableWebRecordingSubmissionJob) => PortableWebRecordingSubmissionJob,
  ): Promise<PortableWebRecordingSubmissionJob | null> {
    const database = await this.openDatabase();
    try {
      const transaction = database.transaction(SUBMISSION_JOB_STORE_NAME, "readwrite");
      const store = transaction.objectStore(SUBMISSION_JOB_STORE_NAME);
      const current = parseStoredSubmissionJobEnvelope(
        await requestResult(store.get(id)),
        this.ownerId,
      );
      if (!current) {
        await transactionComplete(transaction);
        return null;
      }
      const next = finalizeClaimedSubmissionJobEnvelope({
        envelope: current,
        claim,
        nowMs: Date.parse(now),
        update,
      });
      if (!next) {
        await transactionComplete(transaction);
        return null;
      }
      store.put(next, id);
      await transactionComplete(transaction);
      return next.job;
    } finally {
      database.close();
    }
  }

  private async checkpointClaimedJob(
    id: string,
    claim: SubmissionJobClaim,
    update: (job: PortableWebRecordingSubmissionJob) => PortableWebRecordingSubmissionJob,
  ): Promise<PortableWebRecordingSubmissionJob | null> {
    const database = await this.openDatabase();
    try {
      const transaction = database.transaction(SUBMISSION_JOB_STORE_NAME, "readwrite");
      const store = transaction.objectStore(SUBMISSION_JOB_STORE_NAME);
      const current = parseStoredSubmissionJobEnvelope(
        await requestResult(store.get(id)),
        this.ownerId,
      );
      if (!current) {
        await transactionComplete(transaction);
        return null;
      }
      const next = checkpointClaimedSubmissionJobEnvelope({ envelope: current, claim, update });
      if (!next) {
        await transactionComplete(transaction);
        return null;
      }
      store.put(next, id);
      await transactionComplete(transaction);
      return next.job;
    } finally {
      database.close();
    }
  }

  private validateArtifactOwner(
    artifact: PortableWebRecordingArtifact,
  ): PortableWebRecordingArtifact {
    const parsed = portableWebRecordingArtifactSchema.parse(artifact);
    if (parsed.ownerId !== this.ownerId) {
      throw new Error("Recording artifact owner does not match storage owner.");
    }
    return parsed;
  }

  private createSubmissionJobEnvelope(
    job: PortableWebRecordingSubmissionJob,
  ): StoredSubmissionJobEnvelope {
    return { job, claimOwner: null, claimExpiresAtMs: 0, revision: 0 };
  }

  private parseOwnedArtifact(value: unknown): PortableWebRecordingArtifact | null {
    const parsed = portableWebRecordingArtifactSchema.safeParse(value);
    if (
      !parsed.success &&
      typeof value === "object" &&
      value !== null &&
      "ownerId" in value &&
      value.ownerId === this.ownerId
    )
      throw new UnsupportedRecordingContractError();
    if (!parsed.success || parsed.data.ownerId !== this.ownerId) return null;
    return parsed.data;
  }

  private assertLease(stored: StoredTimerDraftEnvelope | undefined): void {
    if (stored?.draft && !portableTimerRecordingDraftSchema.safeParse(stored.draft).success)
      throw new UnsupportedRecordingContractError();
    if (stored?.leaseOwner !== this.instanceId) {
      throw new TimerDraftStorageInUseError("Timer recording ownership belongs to another tab.");
    }
  }

  private async openDatabase(): Promise<IDBDatabase> {
    if (typeof indexedDB === "undefined") {
      throw new TimerDraftStorageUnavailableError("IndexedDB is unavailable.");
    }

    return await new Promise((resolve, reject) => {
      const request = indexedDB.open(TIMER_DRAFT_DATABASE_NAME, TIMER_DRAFT_DATABASE_VERSION);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(TIMER_DRAFT_STORE_NAME);
        request.result.createObjectStore(FINALIZED_ARTIFACT_STORE_NAME);
        request.result.createObjectStore(SUBMISSION_JOB_STORE_NAME);
        request.result.createObjectStore(MEASURED_CHUNK_STORE_NAME);
        request.result.createObjectStore(LEGACY_ARCHIVE_STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error("Could not open timer recording storage."));
      request.onblocked = () => reject(new Error("Timer recording storage upgrade was blocked."));
    });
  }

  async getLegacyArchive(): Promise<LegacyRecordingArchive | null> {
    const protectedArchive = await this.protectedLegacyArchive();
    if (protectedArchive) return protectedArchive;
    const legacy = await readLegacyRecordingArchive(this.ownerId);
    return legacy.databases.length ? legacy : null;
  }

  private async protectedLegacyArchive(): Promise<LegacyRecordingArchive | null> {
    const database = await this.openDatabase();
    try {
      const tx = database.transaction(LEGACY_ARCHIVE_STORE_NAME, "readonly");
      const value: unknown = await requestResult(
        tx.objectStore(LEGACY_ARCHIVE_STORE_NAME).get(this.ownerId),
      );
      if (value === undefined) return null;
      const parsed = legacyRecordingArchiveSchema.parse(value);
      if (parsed.ownerId !== this.ownerId)
        throw new Error("Legacy archive ownership could not be verified; data is retained.");
      return parsed;
    } finally {
      database.close();
    }
  }

  private async hasCurrentDraft(): Promise<boolean> {
    const database = await this.openDatabase();
    try {
      const tx = database.transaction(TIMER_DRAFT_STORE_NAME, "readonly");
      const value = (await requestResult(
        tx.objectStore(TIMER_DRAFT_STORE_NAME).get(this.storageKey),
      )) as StoredTimerDraftEnvelope | undefined;
      return Boolean(value?.draft);
    } finally {
      database.close();
    }
  }

  private async copyLegacyArchive(archive: LegacyRecordingArchive): Promise<void> {
    const copy = prepareLegacyRecordingCopy(archive, this.now());
    if (
      copy.draft &&
      archive.blockedArtifactIds.includes(copy.draft.sessionSnapshot.identity.sessionId)
    )
      throw new Error(
        "The older draft has an existing submission. Download its archive for review; it was not restarted.",
      );
    const database = await this.openDatabase();
    const tx = database.transaction(
      [
        TIMER_DRAFT_STORE_NAME,
        MEASURED_CHUNK_STORE_NAME,
        FINALIZED_ARTIFACT_STORE_NAME,
        LEGACY_ARCHIVE_STORE_NAME,
      ],
      "readwrite",
    );
    const complete = transactionComplete(tx);
    try {
      const store = tx.objectStore(TIMER_DRAFT_STORE_NAME);
      const current = (await requestResult(store.get(this.storageKey))) as
        | StoredTimerDraftEnvelope
        | undefined;
      if (current?.draft)
        throw new Error("Current recorder data exists; older data was not copied over it.");
      if (await requestResult(tx.objectStore(LEGACY_ARCHIVE_STORE_NAME).get(this.ownerId)))
        throw new Error("Older recovery data was already copied by another tab. Reload recovery.");
      if (copy.draft) {
        const { measuredJournal, ...timer } = copy.draft;
        const journal = closeMeasuredWindow(
          measuredJournal ?? emptyMeasuredJournal(),
          timer.timing.updatedAt,
        );
        const paused = portableTimerRecordingDraftSchema.parse({ ...timer, lifecycle: "paused" });
        const header = {
          version: journal.version,
          provenance: journal.provenance,
          windows: journal.windows,
        };
        let measured: StoredMeasuredCursor | null = null;
        for (let cursor = 0; cursor < journal.entries.length; cursor += MEASURED_BATCH_SIZE) {
          const entries = journal.entries.slice(cursor, cursor + MEASURED_BATCH_SIZE);
          measured = nextMeasuredCursor(
            measured,
            { header, expectedCursor: cursor, entries },
            timer.timing.startedAt,
            timer.timing.updatedAt,
          );
          tx.objectStore(MEASURED_CHUNK_STORE_NAME).add(entries, [
            this.ownerId,
            timer.sessionSnapshot.identity.sessionId,
            cursor + 1,
          ]);
        }
        measured ??= nextMeasuredCursor(
          null,
          { header, expectedCursor: 0, entries: [] },
          timer.timing.startedAt,
          timer.timing.updatedAt,
        );
        store.put(
          {
            ownerId: this.ownerId,
            draft: paused,
            measured,
            leaseOwner: this.instanceId,
            leaseExpiresAtMs: this.now() + TIMER_DRAFT_LEASE_MS,
          } satisfies StoredTimerDraftEnvelope,
          this.storageKey,
        );
      }
      for (const artifact of copy.artifacts) {
        const existing = await requestResult(
          tx.objectStore(FINALIZED_ARTIFACT_STORE_NAME).get(artifact.recordingSessionId),
        );
        if (!existing)
          tx.objectStore(FINALIZED_ARTIFACT_STORE_NAME).put(artifact, artifact.recordingSessionId);
      }
      tx.objectStore(LEGACY_ARCHIVE_STORE_NAME).put(archive, this.ownerId);
      await complete;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* Preserve the original failure after a completed abort. */
      }
      await complete.catch(() => undefined);
      throw error;
    } finally {
      database.close();
    }
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Timer recording storage request failed."));
  });
}

function isRecordingDraft(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    ("sessionSnapshot" in value || "measuredJournal" in value)
  );
}

function measuredKeyRange(
  ownerId: string,
  sessionId: string,
  cursor = Number.MAX_SAFE_INTEGER,
): IDBKeyRange {
  return IDBKeyRange.bound([ownerId, sessionId, 0], [ownerId, sessionId, cursor]);
}
function databaseChunkRange(
  transaction: IDBTransaction,
  ownerId: string,
  sessionId: string,
  cursor: number,
): IDBRequest<unknown[]> {
  return transaction
    .objectStore(MEASURED_CHUNK_STORE_NAME)
    .getAll(measuredKeyRange(ownerId, sessionId, cursor));
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Timer recording storage transaction failed."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Timer recording storage transaction was aborted."));
  });
}
