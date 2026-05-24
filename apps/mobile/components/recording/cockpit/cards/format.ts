import type { useCurrentReadings } from "@/lib/hooks/useActivityRecorder";

export function formatSeconds(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds
      .toString()
      .padStart(2, "0")}`;
  }

  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

export function formatPrimaryReading(readings: ReturnType<typeof useCurrentReadings>) {
  if (readings.power) return `${Math.round(readings.power)} W`;
  if (readings.heartRate) return `${Math.round(readings.heartRate)} bpm`;
  if (readings.cadence) return `${Math.round(readings.cadence)} rpm`;
  return "time";
}
