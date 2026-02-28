export function shouldShowZoneA(
  gpsRecordingEnabled: boolean,
  hasRoute: boolean,
): boolean {
  return gpsRecordingEnabled || hasRoute;
}
