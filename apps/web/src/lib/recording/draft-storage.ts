import {
  type PortableTimerRecordingDraft,
  type PortableWebRecordingArtifact,
  type PortableWebRecordingSubmissionJob,
  portableTimerRecordingDraftSchema,
  portableWebRecordingArtifactSchema,
  portableWebRecordingSubmissionJobSchema,
} from "@repo/core";

import { createQueuedSubmissionJob } from "./submission-queue";
import { createTimerOnlyRecordingDraft, type TimerOnlyRecordingState } from "./timer-runtime";

export interface TimerDraftStorage {
  load(): Promise<unknown>;
  save(draft: PortableTimerRecordingDraft): Promise<void>;
  remove(): Promise<void>;
}

export interface WebRecordingStorage extends TimerDraftStorage {
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
  markSubmissionJobSubmitting(id: string, now: string): Promise<PortableWebRecordingSubmissionJob>;
  markSubmissionJobRetry(
    id: string,
    now: string,
    nextAttemptAt: string,
    reason: string,
  ): Promise<PortableWebRecordingSubmissionJob>;
  markSubmissionJobSubmitted(
    id: string,
    now: string,
    activityId: string,
  ): Promise<PortableWebRecordingSubmissionJob>;
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
): Promise<void> {
  const draft = createTimerOnlyRecordingDraft(state, nowMs, ownerId);
  if (draft) {
    await storage.save(draft);
    return;
  }

  await storage.remove();
}

const TIMER_DRAFT_DATABASE_NAME = "gradientpeak-web-recording";
const TIMER_DRAFT_STORE_NAME = "timer-drafts";
const FINALIZED_ARTIFACT_STORE_NAME = "finalized-artifacts";
const SUBMISSION_JOB_STORE_NAME = "submission-jobs";
export const TIMER_DRAFT_STORAGE_KEY = "active-timer-recording";
const TIMER_DRAFT_LEASE_MS = 45_000;

type StoredTimerDraftEnvelope = {
  ownerId: string;
  draft: PortableTimerRecordingDraft | null;
  leaseOwner: string | null;
  leaseExpiresAtMs: number;
};

export class TimerDraftStorageUnavailableError extends Error {}
export class TimerDraftStorageInUseError extends Error {}

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
      const transaction = database.transaction(TIMER_DRAFT_STORE_NAME, "readwrite");
      const store = transaction.objectStore(TIMER_DRAFT_STORE_NAME);
      const stored = (await requestResult(store.get(this.storageKey))) as
        | StoredTimerDraftEnvelope
        | undefined;
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
        throw new TimerDraftStorageInUseError("This timer draft is active in another tab.");
      }

      const envelope: StoredTimerDraftEnvelope = {
        ownerId: this.ownerId,
        draft: stored?.ownerId === this.ownerId ? stored.draft : null,
        leaseOwner: this.instanceId,
        leaseExpiresAtMs: nowMs + TIMER_DRAFT_LEASE_MS,
      };
      store.put(envelope, this.storageKey);
      await transactionComplete(transaction);
      return envelope.draft;
    } catch (error) {
      if (error instanceof TimerDraftStorageInUseError) throw error;
      throw error;
    } finally {
      database.close();
    }
  }

  async takeOver(): Promise<void> {
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
    if (validatedDraft.ownerId !== this.ownerId) {
      throw new Error("Timer draft owner does not match storage owner.");
    }
    const database = await this.openDatabase();

    try {
      const transaction = database.transaction(TIMER_DRAFT_STORE_NAME, "readwrite");
      const store = transaction.objectStore(TIMER_DRAFT_STORE_NAME);
      const stored = (await requestResult(store.get(this.storageKey))) as
        | StoredTimerDraftEnvelope
        | undefined;
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
        throw new TimerDraftStorageInUseError("Timer draft ownership belongs to another tab.");
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

  async remove(): Promise<void> {
    const database = await this.openDatabase();

    try {
      const transaction = database.transaction(TIMER_DRAFT_STORE_NAME, "readwrite");
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
        throw new TimerDraftStorageInUseError("Timer draft ownership was lost.");
      }

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
        [TIMER_DRAFT_STORE_NAME, FINALIZED_ARTIFACT_STORE_NAME],
        "readwrite",
      );
      const draftStore = transaction.objectStore(TIMER_DRAFT_STORE_NAME);
      const artifactStore = transaction.objectStore(FINALIZED_ARTIFACT_STORE_NAME);
      const stored = (await requestResult(draftStore.get(this.storageKey))) as
        | StoredTimerDraftEnvelope
        | undefined;
      this.assertLease(stored);
      artifactStore.put(validatedArtifact, validatedArtifact.recordingSessionId);
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
    for (const artifact of artifacts) {
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
    const database = await this.openDatabase();
    try {
      const transaction = database.transaction(
        [FINALIZED_ARTIFACT_STORE_NAME, SUBMISSION_JOB_STORE_NAME],
        "readwrite",
      );
      const artifactStore = transaction.objectStore(FINALIZED_ARTIFACT_STORE_NAME);
      const jobStore = transaction.objectStore(SUBMISSION_JOB_STORE_NAME);
      const existing = this.parseOwnedJob(
        await requestResult(jobStore.get(validatedArtifact.recordingSessionId)),
      );
      const job =
        existing?.status === "submitted"
          ? existing
          : createQueuedSubmissionJob(validatedArtifact, now);
      artifactStore.put(validatedArtifact, validatedArtifact.recordingSessionId);
      jobStore.put(job, job.id);
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
      return this.parseOwnedJob(value);
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
        .map((value) => this.parseOwnedJob(value))
        .filter(
          (job): job is PortableWebRecordingSubmissionJob =>
            Boolean(job) &&
            job?.status !== "submitted" &&
            (!job?.nextAttemptAt || Date.parse(job.nextAttemptAt) <= nowMs),
        );
    } finally {
      database.close();
    }
  }

  async markSubmissionJobSubmitting(
    id: string,
    now: string,
  ): Promise<PortableWebRecordingSubmissionJob> {
    return this.updateJob(id, (job) => ({
      ...job,
      status: "submitting",
      updatedAt: now,
      nextAttemptAt: null,
    }));
  }

  async markSubmissionJobRetry(
    id: string,
    now: string,
    nextAttemptAt: string,
    reason: string,
  ): Promise<PortableWebRecordingSubmissionJob> {
    return this.updateJob(id, (job) => ({
      ...job,
      status: "retry_wait",
      attempts: job.attempts + 1,
      updatedAt: now,
      nextAttemptAt,
      lastError: reason,
    }));
  }

  async markSubmissionJobSubmitted(
    id: string,
    now: string,
    activityId: string,
  ): Promise<PortableWebRecordingSubmissionJob> {
    return this.updateJob(id, (job) => ({
      ...job,
      status: "submitted",
      attempts: job.attempts + 1,
      updatedAt: now,
      nextAttemptAt: null,
      lastError: null,
      activityId,
    }));
  }

  async retrySubmissionNow(id: string, now: string): Promise<PortableWebRecordingSubmissionJob> {
    return this.updateJob(id, (job) => ({
      ...job,
      status: "queued",
      updatedAt: now,
      nextAttemptAt: null,
      lastError: null,
    }));
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
      const job = this.parseOwnedJob(await requestResult(jobStore.get(id)));
      if (job?.status === "submitted") {
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
      const current = this.parseOwnedJob(await requestResult(store.get(id)));
      if (!current) {
        transaction.abort();
        throw new Error("Recording submission job was not found.");
      }
      const next = portableWebRecordingSubmissionJobSchema.parse(update(current));
      store.put(next, id);
      await transactionComplete(transaction);
      return next;
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

  private parseOwnedJob(value: unknown): PortableWebRecordingSubmissionJob | null {
    const parsed = portableWebRecordingSubmissionJobSchema.safeParse(value);
    if (!parsed.success || parsed.data.artifact.ownerId !== this.ownerId) return null;
    return parsed.data;
  }

  private assertLease(stored: StoredTimerDraftEnvelope | undefined): void {
    if (stored?.leaseOwner !== this.instanceId) {
      throw new TimerDraftStorageInUseError("Timer draft ownership belongs to another tab.");
    }
  }

  private async openDatabase(): Promise<IDBDatabase> {
    if (typeof indexedDB === "undefined") {
      throw new TimerDraftStorageUnavailableError("IndexedDB is unavailable.");
    }

    return await new Promise((resolve, reject) => {
      const request = indexedDB.open(TIMER_DRAFT_DATABASE_NAME, 2);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(TIMER_DRAFT_STORE_NAME)) {
          request.result.createObjectStore(TIMER_DRAFT_STORE_NAME);
        }
        if (!request.result.objectStoreNames.contains(FINALIZED_ARTIFACT_STORE_NAME)) {
          request.result.createObjectStore(FINALIZED_ARTIFACT_STORE_NAME);
        }
        if (!request.result.objectStoreNames.contains(SUBMISSION_JOB_STORE_NAME)) {
          request.result.createObjectStore(SUBMISSION_JOB_STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error("Could not open timer draft storage."));
      request.onblocked = () => reject(new Error("Timer draft storage upgrade was blocked."));
    });
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Timer draft storage request failed."));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Timer draft storage transaction failed."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Timer draft storage transaction was aborted."));
  });
}
