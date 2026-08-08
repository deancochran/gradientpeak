import type { AppRouter, inferRouterOutputs } from "@repo/api/client";
import type { BuilderDailyTrainingPathChartViewModel } from "../view-model";

export type ProjectionPreviewOutput = inferRouterOutputs<AppRouter>["trainingPlans"]["preview"];

export type BackendPreviewProjection = {
  source: "backend";
  isAvailable: true;
  readinessScore: number | null;
  readinessConfidence: number | null;
  feasibilityState: "feasible" | "aggressive" | "unsafe" | null;
  feasibilityReasons: string[];
  conflicts: {
    isBlocking: boolean;
    items: Array<{ code: string; severity: string; message: string }>;
  };
  planPreview: {
    name: string;
    startDate: string;
    endDate: string;
    goalCount: number;
    blockCount: number;
  } | null;
  projectionChart: unknown;
  simulation: Extract<ProjectionPreviewOutput, { status: "available" }>["simulation"];
};

export type LocalFallbackProjection = {
  source: "local";
  isAvailable: true;
  chart: unknown;
  reason: string;
};

export type UnavailableProjection = {
  source: "none";
  isAvailable: false;
  reason: string;
};

export type ActiveTrainingPlanProjection =
  | BackendPreviewProjection
  | LocalFallbackProjection
  | UnavailableProjection;

export type TrainingPathChartProjectionResult = {
  chart: BuilderDailyTrainingPathChartViewModel;
  source: "backend" | "local";
};

export type TrainingPathProjectionStatus = {
  source: "backend" | "local";
  backendInputAvailable: boolean;
  backendPreviewEnabled: boolean;
  backendPreviewLoading: boolean;
  backendPreviewError: string | null;
  backendPreviewHasSnapshot: boolean;
  fallbackReason: string | null;
};

export type ScheduleInspectorBackendInsight = {
  source: "backend";
  headline: string;
  detail: string;
  riskLabel: string | null;
  recommendation: string | null;
  outcome: "Better prepared" | "Too fatigued" | "Needs support";
};
