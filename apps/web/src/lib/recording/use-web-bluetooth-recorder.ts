import { useEffect, useRef, useSyncExternalStore } from "react";
import { WebBluetoothRecorder, webBluetoothServerSnapshot } from "./web-bluetooth";

export function useWebBluetoothRecorder() {
  const recorder = useRef<WebBluetoothRecorder | null>(null);
  if (!recorder.current) recorder.current = new WebBluetoothRecorder();
  useEffect(() => () => recorder.current?.disconnect(), []);
  return {
    recorder: recorder.current,
    state: useSyncExternalStore(
      recorder.current.subscribe,
      recorder.current.getState,
      webBluetoothServerSnapshot,
    ),
  };
}
