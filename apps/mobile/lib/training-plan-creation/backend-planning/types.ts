import type { AppRouter, inferRouterOutputs } from "@repo/api/client";
import type { DailyTrainingAdjustmentPoint } from "@/lib/training-path/dailyTrainingPathModel";

export type ProjectionPreviewOutput = inferRouterOutputs<AppRouter>["trainingPlans"]["preview"];

export type BackendPreviewProjection = {
  source: "backend";
  isAvailable: true;
  projectionChart: Extract<ProjectionPreviewOutput, { status: "available" }>["simulation"];
  simulation: Extract<ProjectionPreviewOutput, { status: "available" }>["simulation"];
};

export type BuilderDailyTrainingPathChartViewModel = {
  dailyPoints: DailyTrainingAdjustmentPoint[];
  weeks: Array<{
    weekStart: string;
    weekEnd: string;
    label: string;
    completedLoad: number | null;
    plannedLoad: number | null;
    targetLoad: number | null;
    fitness: number | null;
    scheduledFitness: number | null;
    targetFitness: number | null;
    fatigue: number | null;
    form: number | null;
    riskZone: null;
    isCurrent: boolean;
    isSelected: boolean;
  }>;
  selectedWeekSummary: null;
  goalMarkers: Array<{ id: string; label: string; targetDate: string; weekStart: string }>;
  todayKey: string;
  domains: { load: [number, number]; fitness: [number, number] };
  emptyState: "noActivityHistory" | null;
};

export type TrainingPathChartProjectionResult = {
  chart: BuilderDailyTrainingPathChartViewModel;
  source: "backend" | "none";
};
