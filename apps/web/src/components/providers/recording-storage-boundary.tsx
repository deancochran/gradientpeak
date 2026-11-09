import { createContext, useCallback, useContext, useEffect, useState } from "react";

import { ensureCurrentBrowserContractEpoch } from "../../lib/contract-epoch";

export type RecordingStorageState = "checking" | "ready" | "blocked";

type RecordingStorageReadiness = {
  state: RecordingStorageState;
  retry: () => void;
};

const RecordingStorageContext = createContext<RecordingStorageReadiness | null>(null);

export function RecordingStorageBoundary({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<RecordingStorageState>("checking");

  const prepare = useCallback(() => {
    setState("checking");
    void ensureCurrentBrowserContractEpoch().then(
      () => setState("ready"),
      () => setState("blocked"),
    );
  }, []);

  useEffect(() => {
    prepare();
  }, [prepare]);

  return (
    <RecordingStorageContext.Provider value={{ state, retry: prepare }}>
      {children}
    </RecordingStorageContext.Provider>
  );
}

export function useRecordingStorageReadiness(): RecordingStorageReadiness {
  const readiness = useContext(RecordingStorageContext);
  if (!readiness) {
    throw new Error("useRecordingStorageReadiness must be used within RecordingStorageBoundary.");
  }
  return readiness;
}
