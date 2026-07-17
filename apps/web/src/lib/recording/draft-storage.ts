import { type PortableTimerRecordingDraft, portableTimerRecordingDraftSchema } from "@repo/core";

import { createTimerOnlyRecordingDraft, type TimerOnlyRecordingState } from "./timer-runtime";

export interface TimerDraftStorage {
  load(): Promise<unknown>;
  save(draft: PortableTimerRecordingDraft): Promise<void>;
  remove(): Promise<void>;
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

export class IndexedDbTimerDraftStorage implements TimerDraftStorage {
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

  private async openDatabase(): Promise<IDBDatabase> {
    if (typeof indexedDB === "undefined") {
      throw new TimerDraftStorageUnavailableError("IndexedDB is unavailable.");
    }

    return await new Promise((resolve, reject) => {
      const request = indexedDB.open(TIMER_DRAFT_DATABASE_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(TIMER_DRAFT_STORE_NAME)) {
          request.result.createObjectStore(TIMER_DRAFT_STORE_NAME);
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
