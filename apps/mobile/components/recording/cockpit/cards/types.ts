import type { RecordingSessionContract } from "@repo/core";
import type { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import type {
  CurrentReadings,
  RecordingPlanView,
  SessionStats,
} from "@/lib/services/ActivityRecorder/types";

export interface InsightCardProps {
  mode: "compact" | "expanded";
  readings: CurrentReadings;
  sensorCount: number;
  sessionContract: RecordingSessionContract | null;
  service: ActivityRecorderService | null;
  stats: SessionStats;
  plan: RecordingPlanView & {
    advance: () => void;
    previous: () => void;
    skip: () => void;
  };
}
