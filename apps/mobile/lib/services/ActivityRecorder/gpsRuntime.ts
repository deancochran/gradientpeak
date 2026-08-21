type RecordingState = "pending" | "ready" | "recording" | "paused" | "finishing" | "finished";

export function getNextGpsRecordingEnabled(current: boolean): boolean {
  void current;
  return false;
}

export function shouldStartGpsTracking(
  state: RecordingState,
  gpsRecordingEnabled: boolean,
): boolean {
  void state;
  void gpsRecordingEnabled;
  return false;
}
