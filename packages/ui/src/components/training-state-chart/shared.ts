export {
  formatTrainingStateDate,
  formatTrainingStateValue,
  getTrainingStateAccessibilityLabel,
  getTrainingStateMetric,
  getTrainingStateSourceLabel,
  getTrainingStateSourceStatus,
  type TrainingStateMetricId,
  type TrainingStateMetricValues,
  type TrainingStateSource,
  type TrainingStateSourceStatus,
  type TrainingStateVisualContract,
  type TrainingStateVisualPoint,
  trainingStateHasValues,
  trainingStateMetricIds,
  trainingStateMetrics,
  trainingStateSourceLabels,
} from "../../lib/training-state";

import type React from "react";
import type {
  TrainingStateMetricId,
  TrainingStateSource,
  TrainingStateVisualContract,
} from "../../lib/training-state";

export type TrainingStateLegendProps = {
  /** Native callers supply resolved theme colors; web uses the semantic CSS colors by default. */
  colors?: Partial<Record<TrainingStateMetricId, string>>;
  metrics?: readonly TrainingStateMetricId[];
  sources?: readonly TrainingStateSource[];
  testId?: string;
};

export type TrainingStateVisualFixture = TrainingStateVisualContract & TrainingStateLegendProps;

export type TrainingStateChartProps = {
  children?: React.ReactNode;
  className?: string;
  description?: string;
  emptyMessage: string;
  metric: TrainingStateMetricId;
  source: TrainingStateSource;
  testId?: string;
  title?: string;
  visual: TrainingStateVisualContract;
};
