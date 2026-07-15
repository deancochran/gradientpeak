import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../card/index.web";
import type { ChartCardProps, ChartEmptyStateProps } from "./shared";
import { getChartAccessibilityLabel } from "./shared";

function ChartCard({
  children,
  className,
  description,
  legend,
  summary,
  testId,
  title,
}: ChartCardProps) {
  return (
    <Card className={className} testId={testId}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {legend?.length ? (
          <ul aria-label="Chart legend" className="flex list-none flex-wrap gap-3 p-0">
            {legend.map((item) => (
              <li className="flex items-center gap-1 text-xs text-muted-foreground" key={item.id}>
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                {item.label}
              </li>
            ))}
          </ul>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="sr-only" role="status">
          {getChartAccessibilityLabel(title, summary)}
        </p>
        {children}
        {summary?.length ? (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {summary.map((item) => (
              <div key={item.label}>
                <dt className="text-xs text-muted-foreground">{item.label}</dt>
                <dd className="text-sm font-semibold">{item.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ChartEmptyState({ message, testId }: ChartEmptyStateProps) {
  return (
    <div
      className="flex min-h-56 items-center justify-center rounded-xl border border-dashed px-4 text-center text-sm text-muted-foreground"
      data-testid={testId}
    >
      {message}
    </div>
  );
}

export type {
  ChartCardProps,
  ChartEmptyStateProps,
  ChartLegendItem,
  ChartSummaryItem,
} from "./shared";
export { ChartCard, ChartEmptyState, getChartAccessibilityLabel };
