import { CONTRACT_EPOCH_HEADER, CURRENT_CONTRACT_EPOCH } from "@repo/api/client";

export const CONTRACT_EPOCH_STORAGE_KEY = "gradientpeak:contract-epoch";
export const CONTRACT_EPOCH_DATABASE_DELETE_TIMEOUT_MS = 5_000;
export const LEGACY_WEB_RECORDING_DATABASE_NAME = "gradientpeak-web-recording";
export const WEB_RECORDING_DATABASE_PREFIX = "gradientpeak-web-recording-epoch-";
export const WEB_RECORDING_DATABASE_NAME = `${WEB_RECORDING_DATABASE_PREFIX}${CURRENT_CONTRACT_EPOCH}`;
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
const PRODUCT_SESSION_STORAGE_KEYS = [
  "gradientpeak:vite-preload-reload",
  "gradientpeak.recording.instance-id",
] as const;

type StorageLike = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export type ContractEpochRuntime = {
  localStorage: StorageLike;
  sessionStorage: StorageLike;
  deleteDatabase: (name: string) => Promise<void>;
  listDatabaseNames?: () => Promise<readonly string[]>;
};

export function createBrowserContractEpochRuntime(): ContractEpochRuntime {
  return {
    localStorage: window.localStorage,
    sessionStorage: window.sessionStorage,
    deleteDatabase: deleteBrowserDatabase,
    listDatabaseNames: listBrowserDatabaseNames,
  };
}

export async function ensureCurrentBrowserContractEpoch(): Promise<boolean> {
  return await ensureCurrentContractEpoch(createBrowserContractEpochRuntime());
}

export async function ensureCurrentContractEpoch(runtime: ContractEpochRuntime): Promise<boolean> {
  const storedEpoch = runtime.localStorage.getItem(CONTRACT_EPOCH_STORAGE_KEY);
  if (storedEpoch === CURRENT_CONTRACT_EPOCH_VALUE) {
    return false;
  }

  const recordingDatabaseNames = new Set([
    LEGACY_WEB_RECORDING_DATABASE_NAME,
    WEB_RECORDING_DATABASE_NAME,
  ]);
  for (let priorEpoch = 0; priorEpoch < CURRENT_CONTRACT_EPOCH; priorEpoch += 1) {
    recordingDatabaseNames.add(`${WEB_RECORDING_DATABASE_PREFIX}${priorEpoch}`);
  }
  if (storedEpoch) {
    recordingDatabaseNames.add(`${WEB_RECORDING_DATABASE_PREFIX}${storedEpoch}`);
  }
  for (const databaseName of (await runtime.listDatabaseNames?.()) ?? []) {
    if (databaseName.startsWith(WEB_RECORDING_DATABASE_PREFIX)) {
      recordingDatabaseNames.add(databaseName);
    }
  }
  for (const databaseName of recordingDatabaseNames) {
    await runtime.deleteDatabase(databaseName);
  }

  for (const key of PRODUCT_LOCAL_STORAGE_KEYS) {
    runtime.localStorage.removeItem(key);
  }
  for (const key of PRODUCT_SESSION_STORAGE_KEYS) {
    runtime.sessionStorage.removeItem(key);
  }

  // This must remain the final operation: a failed reset is retried on the next bootstrap.
  runtime.localStorage.setItem(CONTRACT_EPOCH_STORAGE_KEY, CURRENT_CONTRACT_EPOCH_VALUE);
  return true;
}

async function listBrowserDatabaseNames(): Promise<readonly string[]> {
  if (typeof indexedDB === "undefined" || typeof indexedDB.databases !== "function") return [];

  return (await indexedDB.databases()).flatMap((database) =>
    typeof database.name === "string" ? [database.name] : [],
  );
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
