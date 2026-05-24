import type { RecordingSessionContract } from "@repo/core";
import type { useCurrentReadings, usePlan, useSessionStats } from "@/lib/hooks/useActivityRecorder";
import type { ActivityRecorderService } from "@/lib/services/ActivityRecorder";

export interface InsightCardProps {
  mode: "compact" | "expanded";
  readings: ReturnType<typeof useCurrentReadings>;
  sensorCount: number;
  sessionContract: RecordingSessionContract | null;
  service: ActivityRecorderService | null;
  stats: ReturnType<typeof useSessionStats>;
  plan: ReturnType<typeof usePlan>;
}
