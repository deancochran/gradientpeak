import type { CreateFromCreationConfigInput, PreviewCreationConfigInput } from "@repo/core";
import type { TrainingPlanPlanningContext } from "../planning-context";
import type { BuilderDailyTrainingPathChartViewModel } from "../view-model";

export type BackendPlanningOperation =
  | "getCreationSuggestions"
  | "previewCreationConfig"
  | "createFromCreationConfig"
  | "updateFromCreationConfig";

export type BackendPlanningClientStatus = {
  available: boolean;
  enabledOperations: BackendPlanningOperation[];
  reason: string;
};

export type BackendPlanningRequestSnapshot = {
  context: TrainingPlanPlanningContext;
  operation: BackendPlanningOperation;
};

export type BackendPlanningState = {
  status: BackendPlanningClientStatus;
  plannedOperations: BackendPlanningOperation[];
  contextFingerprint: string;
  previewInput: PreviewCreationConfigInput | null;
  previewRequest: BackendPlanningRequestSnapshot;
};

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
  previewSnapshotToken: string | null;
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

export type BackendCreationConfigMappingResult =
  | { ok: true; input: PreviewCreationConfigInput }
  | { ok: false; reason: string };

export type BackendCreateCommitMappingResult =
  | { ok: true; input: CreateFromCreationConfigInput }
  | { ok: false; reason: string };

export type UpdateFromCreationConfigInput = CreateFromCreationConfigInput & {
  plan_id: string;
};

export type BackendUpdateCommitMappingResult =
  | { ok: true; input: UpdateFromCreationConfigInput }
  | { ok: false; reason: string };
