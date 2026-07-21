import { useEffect, useMemo, useState } from "react";

import {
  browserRecordingRuntime,
  createWebRecordingAdapterRegistry,
  defaultWebRecordingRuntime,
} from "./adapters";

export function useBrowserRecordingAdapters() {
  const [runtime, setRuntime] = useState(defaultWebRecordingRuntime);
  useEffect(() => setRuntime(browserRecordingRuntime()), []);
  return useMemo(() => createWebRecordingAdapterRegistry(runtime), [runtime]);
}
