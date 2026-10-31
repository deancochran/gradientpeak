import type { Page } from "@playwright/test";
import type { PortableWebRecordingArtifact } from "@repo/core";
import {
  TIMER_DRAFT_DATABASE_NAME,
  TIMER_DRAFT_DATABASE_VERSION,
} from "../../src/lib/recording/draft-storage";

const recordingDatabase = {
  name: TIMER_DRAFT_DATABASE_NAME,
  version: TIMER_DRAFT_DATABASE_VERSION,
} as const;

/**
 * Browser-only fixture setup for an already-finalized recording. Callers must
 * construct and validate the artifact through the real recording builder; this
 * helper only places that durable browser artifact where recovery reads it.
 */
export async function installFinalizedRecordingArtifact(
  page: Page,
  artifact: PortableWebRecordingArtifact,
): Promise<void> {
  await page.evaluate(
    async ({ database, artifact }) => {
      const request = indexedDB.open(database.name, database.version);
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        if (!db.objectStoreNames.contains("finalized-artifacts")) {
          throw new Error("Recording storage was not initialized by the browser runtime.");
        }
        const transaction = db.transaction(["timer-drafts", "finalized-artifacts"], "readwrite");
        transaction.objectStore("finalized-artifacts").put(artifact, artifact.recordingSessionId);
        const drafts = transaction.objectStore("timer-drafts");
        const draftRows = await new Promise<Array<{ ownerId?: string }>>((resolve, reject) => {
          const read = drafts.getAll();
          read.onsuccess = () => resolve(read.result);
          read.onerror = () => reject(read.error);
        });
        for (const row of draftRows) {
          if (row.ownerId === artifact.ownerId) {
            // The runtime always clears the actor's active draft while finalizing.
            drafts.delete(`active-timer-recording:${artifact.ownerId}`);
          }
        }
        await new Promise<void>((resolve, reject) => {
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        });
      } finally {
        db.close();
      }
    },
    { database: recordingDatabase, artifact },
  );
}

export async function waitForActiveRecordingDraft(page: Page): Promise<void> {
  await page.waitForFunction(async ({ name, version }) => {
    const request = indexedDB.open(name, version);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      if (!database.objectStoreNames.contains("timer-drafts")) return false;
      const transaction = database.transaction("timer-drafts", "readonly");
      const valuesRequest = transaction.objectStore("timer-drafts").getAll();
      const values = await new Promise<Array<{ draft?: unknown }>>((resolve, reject) => {
        valuesRequest.onsuccess = () => resolve(valuesRequest.result);
        valuesRequest.onerror = () => reject(valuesRequest.error);
      });
      return values.some((value) => Boolean(value.draft));
    } finally {
      database.close();
    }
  }, recordingDatabase);
}

export async function recordingSubmissionJobCount(page: Page): Promise<number> {
  return page.evaluate(async ({ name, version }) => {
    const request = indexedDB.open(name, version);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      if (!database.objectStoreNames.contains("submission-jobs")) return 0;
      const transaction = database.transaction("submission-jobs", "readonly");
      const countRequest = transaction.objectStore("submission-jobs").count();
      return await new Promise<number>((resolve, reject) => {
        countRequest.onsuccess = () => resolve(countRequest.result);
        countRequest.onerror = () => reject(countRequest.error);
      });
    } finally {
      database.close();
    }
  }, recordingDatabase);
}

export async function recordingSubmissionActivityId(page: Page): Promise<string | null> {
  return page.evaluate(async ({ name, version }) => {
    const request = indexedDB.open(name, version);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      if (!database.objectStoreNames.contains("submission-jobs")) return null;
      const transaction = database.transaction("submission-jobs", "readonly");
      const valuesRequest = transaction.objectStore("submission-jobs").getAll();
      const values = await new Promise<Array<{ job?: { activityId?: string | null } }>>(
        (resolve, reject) => {
          valuesRequest.onsuccess = () => resolve(valuesRequest.result);
          valuesRequest.onerror = () => reject(valuesRequest.error);
        },
      );
      return values.find((value) => value.job?.activityId)?.job?.activityId ?? null;
    } finally {
      database.close();
    }
  }, recordingDatabase);
}

export async function recordingSubmittedSnapshot(
  page: Page,
): Promise<PortableWebRecordingArtifact["snapshot"] | null> {
  return page.evaluate(async ({ name, version }) => {
    const request = indexedDB.open(name, version);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const transaction = database.transaction("submission-jobs", "readonly");
      const request = transaction.objectStore("submission-jobs").getAll();
      const values = await new Promise<
        Array<{
          job?: {
            activityId?: string | null;
            artifact?: { snapshot: PortableWebRecordingArtifact["snapshot"] };
          };
        }>
      >((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return values.find((value) => value.job?.activityId)?.job?.artifact?.snapshot ?? null;
    } finally {
      database.close();
    }
  }, recordingDatabase);
}
