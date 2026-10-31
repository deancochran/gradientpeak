import { CONTRACT_EPOCH_HEADER, CURRENT_CONTRACT_EPOCH } from "@repo/api/client";

export const CONTRACT_EPOCH_STORAGE_KEY = "gradientpeak:contract-epoch";
export const CONTRACT_EPOCH_RECORDING_RECOVERY_KEY =
  "gradientpeak:contract-epoch-recording-recovery";
export const CONTRACT_EPOCH_DATABASE_DELETE_TIMEOUT_MS = 5_000;
export const CONTRACT_EPOCH_RESET_TIMEOUT_MS = 10_000;
export const LEGACY_WEB_RECORDING_DATABASE_NAME = "gradientpeak-web-recording";
export const WEB_RECORDING_DATABASE_PREFIX = "gradientpeak-web-recording-epoch-";
// Independent local wire generation. Epoch-3 readers know only the old exact
// namespace/prefix, so they cannot claim, parse, remove, or reset these drafts.
export const WEB_RECORDING_JOURNAL_DATABASE_PREFIX = "gradientpeak-web-recording-journal-v2-epoch-";
export const WEB_RECORDING_DATABASE_NAME = `${WEB_RECORDING_JOURNAL_DATABASE_PREFIX}${CURRENT_CONTRACT_EPOCH}`;
export const LEGACY_TIMER_RECORDING_DATABASE_NAME = `${WEB_RECORDING_DATABASE_PREFIX}${CURRENT_CONTRACT_EPOCH}`;
export const CURRENT_CONTRACT_EPOCH_VALUE = String(CURRENT_CONTRACT_EPOCH);
export const contractEpochFormInputProps = Object.freeze({
  name: CONTRACT_EPOCH_HEADER,
  type: "hidden" as const,
  value: CURRENT_CONTRACT_EPOCH_VALUE,
});

export function hasCurrentContractEpochFormData(data: unknown): boolean {
  return (
    data instanceof FormData && data.get(CONTRACT_EPOCH_HEADER) === CURRENT_CONTRACT_EPOCH_VALUE
  );
}

const PRODUCT_LOCAL_STORAGE_KEYS = [
  CONTRACT_EPOCH_STORAGE_KEY,
  "gradientpeak-theme-store",
] as const;
const PRODUCT_SESSION_STORAGE_KEYS = ["gradientpeak:vite-preload-reload"] as const;

type StorageLike = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export type ContractEpochRuntime = {
  localStorage: StorageLike;
  sessionStorage: StorageLike;
  deleteDatabase: (name: string) => Promise<void>;
  listDatabaseNames?: () => Promise<readonly string[]>;
};

export type ContractEpochRecordingRecoveryNotice = {
  previousEpoch: string | null;
  detectedDatabaseNames: string[];
  detection: "detected" | "unknown";
};

export function createBrowserContractEpochRuntime(): ContractEpochRuntime {
  return {
    localStorage: window.localStorage,
    sessionStorage: window.sessionStorage,
    deleteDatabase: deleteBrowserDatabase,
    listDatabaseNames: listBrowserDatabaseNames,
  };
}

let currentBrowserContractEpochReset: Promise<boolean> | undefined;

export async function ensureCurrentBrowserContractEpoch(): Promise<boolean> {
  if (!currentBrowserContractEpochReset) {
    currentBrowserContractEpochReset = ensureCurrentContractEpoch(
      createBrowserContractEpochRuntime(),
    );
    void currentBrowserContractEpochReset.catch(() => {
      currentBrowserContractEpochReset = undefined;
    });
  }
  return await currentBrowserContractEpochReset;
}

export async function ensureCurrentContractEpoch(runtime: ContractEpochRuntime): Promise<boolean> {
  const deadline = Date.now() + CONTRACT_EPOCH_RESET_TIMEOUT_MS;
  const beforeDeadline = <T>(operation: Promise<T>, description: string) =>
    withTimeout(operation, Math.max(1, deadline - Date.now()), description);
  const storedEpoch = runtime.localStorage.getItem(CONTRACT_EPOCH_STORAGE_KEY);
  if (storedEpoch === CURRENT_CONTRACT_EPOCH_VALUE) {
    return false;
  }

  const discoveredDatabaseNames = runtime.listDatabaseNames
    ? await beforeDeadline(
        Promise.resolve().then(runtime.listDatabaseNames),
        "Timed out checking local browser data.",
      )
    : [];
  const detectedDatabaseNames = discoveredDatabaseNames.filter(
    (databaseName) =>
      databaseName === LEGACY_WEB_RECORDING_DATABASE_NAME ||
      databaseName.startsWith(WEB_RECORDING_DATABASE_PREFIX) ||
      databaseName.startsWith(WEB_RECORDING_JOURNAL_DATABASE_PREFIX),
  );

  for (const key of PRODUCT_LOCAL_STORAGE_KEYS) {
    runtime.localStorage.removeItem(key);
  }
  for (const key of PRODUCT_SESSION_STORAGE_KEYS) {
    runtime.sessionStorage.removeItem(key);
  }

  if (storedEpoch !== null || detectedDatabaseNames.length > 0) {
    const notice: ContractEpochRecordingRecoveryNotice = {
      previousEpoch: storedEpoch,
      detectedDatabaseNames,
      detection: detectedDatabaseNames.length > 0 ? "detected" : "unknown",
    };
    runtime.localStorage.setItem(CONTRACT_EPOCH_RECORDING_RECOVERY_KEY, JSON.stringify(notice));
  }

  // This must remain the final operation: a failed reset is retried on the next bootstrap.
  runtime.localStorage.setItem(CONTRACT_EPOCH_STORAGE_KEY, CURRENT_CONTRACT_EPOCH_VALUE);
  return true;
}

export function readContractEpochRecordingRecoveryNotice(
  storage?: Pick<Storage, "getItem">,
): ContractEpochRecordingRecoveryNotice | null {
  const target = storage ?? (typeof window === "undefined" ? null : window.localStorage);
  if (!target) return null;
  const value = target.getItem(CONTRACT_EPOCH_RECORDING_RECOVERY_KEY);
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<ContractEpochRecordingRecoveryNotice>;
    if (
      (parsed.previousEpoch === null || typeof parsed.previousEpoch === "string") &&
      (parsed.detection === "detected" || parsed.detection === "unknown") &&
      Array.isArray(parsed.detectedDatabaseNames) &&
      parsed.detectedDatabaseNames.every((name) => typeof name === "string")
    ) {
      return {
        previousEpoch: parsed.previousEpoch,
        detection: parsed.detection,
        detectedDatabaseNames: parsed.detectedDatabaseNames,
      };
    }
  } catch {
    return null;
  }
  return null;
}

export function clearContractEpochRecordingRecoveryNotice(
  storage?: Pick<Storage, "removeItem">,
): void {
  const target = storage ?? (typeof window === "undefined" ? null : window.localStorage);
  target?.removeItem(CONTRACT_EPOCH_RECORDING_RECOVERY_KEY);
}

async function listBrowserDatabaseNames(): Promise<readonly string[]> {
  if (typeof indexedDB === "undefined" || typeof indexedDB.databases !== "function") return [];

  return (await indexedDB.databases()).flatMap((database) =>
    typeof database.name === "string" ? [database.name] : [],
  );
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    void operation.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function deleteBrowserDatabase(name: string): Promise<void> {
  if (typeof indexedDB === "undefined") return Promise.resolve();

  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      if (timeout !== undefined) clearTimeout(timeout);
      callback();
    };

    request.onsuccess = () => settle(resolve);
    request.onerror = () =>
      settle(() => reject(request.error ?? new Error(`Could not delete ${name}.`)));
    request.onblocked = () =>
      settle(() => reject(new Error(`Deleting ${name} is blocked by another tab.`)));
    timeout = setTimeout(
      () =>
        settle(() =>
          reject(new Error(`Timed out deleting ${name}; close other GradientPeak tabs and retry.`)),
        ),
      CONTRACT_EPOCH_DATABASE_DELETE_TIMEOUT_MS,
    );
  });
}
