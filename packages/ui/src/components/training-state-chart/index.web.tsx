import type { TrainingStateLegendProps } from "./shared";
import { getTrainingStateMetric, getTrainingStateSourceLabel } from "./shared";

function TrainingStateLegend({
  colors,
  metrics = ["fitness", "fatigue", "form"],
  sources,
  testId,
}: TrainingStateLegendProps) {
  return (
    <ul
      aria-label="Training-state legend"
      className="flex flex-wrap gap-3 text-xs text-muted-foreground"
      data-testid={testId}
    >
      {metrics.map((metric) => {
        const definition = getTrainingStateMetric(metric);
        return (
          <li className="flex items-center gap-1" key={definition.id}>
            <span
              aria-hidden="true"
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: colors?.[metric] ?? definition.webColor }}
            />
            {definition.label}
          </li>
        );
      })}
      {sources?.map((source) => (
        <li key={source}>━ {getTrainingStateSourceLabel(source)}</li>
      ))}
    </ul>
  );
}

export * from "./shared";
export { TrainingStateLegend };
