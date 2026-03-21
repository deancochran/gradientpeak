type RecordingState = "pending" | "ready" | "recording" | "paused" | "finishing" | "finished";

export function getNextGpsRecordingEnabled(current: boolean): boolean {
  return !current;
}

export function shouldStartGpsTracking(
  state: RecordingState,
  gpsRecordingEnabled: boolean,
): boolean {
  return gpsRecordingEnabled && (state === "recording" || state === "paused");
}
