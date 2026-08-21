import { createWebRecordingAdapterRegistry } from "./adapters";

export function useBrowserRecordingAdapters() {
  return createWebRecordingAdapterRegistry();
}
