import type { DurationV2 } from "../schemas/activity_plan_v2";

export function formatDuration(duration: DurationV2): string {
  switch (duration.type) {
    case "time":
      if (duration.seconds < 60) {
        return `${duration.seconds}s`;
      }
      if (duration.seconds < 3600) {
        const minutes = Math.floor(duration.seconds / 60);
        const seconds = duration.seconds % 60;
        return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
      }
      return formatLongDuration(duration.seconds);
    case "distance":
      return duration.meters < 1000
        ? `${duration.meters}m`
        : `${(duration.meters / 1000).toFixed(2)}km`;
    case "repetitions":
      return `${duration.count} reps`;
    case "untilFinished":
      return "Until finished";
  }
}

function formatLongDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}
