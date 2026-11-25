export {
  formatTrainingStateDate,
  formatTrainingStateValue,
  getTrainingStateAccessibilityLabel,
  getTrainingStateMetric,
  getTrainingStateSourceLabel,
  getTrainingStateSourceStatus,
  type TrainingStateMetricId,
  type TrainingStateMetricValues,
  type TrainingStateSeriesSelection,
  type TrainingStateSource,
  type TrainingStateSourceStatus,
  type TrainingStateVisualContract,
  type TrainingStateVisualPoint,
  trainingStateHasValues,
  trainingStateMetricIds,
  trainingStateMetrics,
  trainingStateSourceLabels,
} from "../../lib/training-state";

import type {
  TrainingStateMetricId,
  TrainingStateSeriesSelection,
  TrainingStateSource,
  TrainingStateVisualContract,
} from "../../lib/training-state";

export type TrainingStateLegendProps = {
  /** Native callers supply resolved theme colors; web uses the semantic CSS colors by default. */
  colors?: Partial<Record<TrainingStateMetricId, string>>;
  metrics?: readonly TrainingStateMetricId[];
  sources?: readonly TrainingStateSource[];
  sourceLabels?: Partial<Record<TrainingStateSource, string>>;
  testId?: string;
};

export type TrainingStateVisualFixture = TrainingStateVisualContract & TrainingStateLegendProps;

export type TrainingStateChartProps = {
  accessibilityLabel?: string;
  className?: string;
  colors?: Partial<Record<TrainingStateMetricId, string>>;
  /**
   * A denser rendering for repeated comparisons. It preserves the selected
   * series, units, date range, latest values, and the full accessible summary.
   */
  density?: "default" | "compact";
  description?: string;
  emptyMessage: string;
  /** Every visible line, legend entry, and announced series must be declared here. */
  series: readonly TrainingStateSeriesSelection[];
  sourceLabels?: Partial<Record<TrainingStateSource, string>>;
  testId?: string;
  title?: string;
  visual: TrainingStateVisualContract;
};
