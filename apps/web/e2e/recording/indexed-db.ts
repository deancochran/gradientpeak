import type { Page } from "@playwright/test";

export async function waitForActiveRecordingDraft(page: Page): Promise<void> {
  await page.waitForFunction(async () => {
    const request = indexedDB.open("gradientpeak-web-recording", 2);
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
  });
}

export async function recordingSubmissionJobCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const request = indexedDB.open("gradientpeak-web-recording", 2);
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
  });
}
