import type { AthletePerformanceOverview } from "@repo/core/performance-model";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import {
  buildPerformanceModelSummary,
  type PerformanceModelSummaryItem,
} from "@repo/ui/lib/performance-model-summary";

type PerformanceModelSummaryProps = {
  error?: string | null;
  isLoading?: boolean;
  onRetry?: () => void;
  overview?: AthletePerformanceOverview;
};

function statusVariant(item: PerformanceModelSummaryItem): "default" | "secondary" | "outline" {
  if (item.status === "available") return "default";
  return "outline";
}

export function PerformanceModelSummary({
  error,
  isLoading,
  onRetry,
  overview,
}: PerformanceModelSummaryProps) {
  return (
    <section aria-labelledby="performance-model-heading" className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold" id="performance-model-heading">
          Current performance
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Current values personalize training when enough recent activity data is available.
        </p>
      </div>

      {isLoading ? (
        <Card>
          <CardContent
            aria-atomic="true"
            aria-live="polite"
            className="py-6 text-sm text-muted-foreground"
            role="status"
          >
            Loading current performance…
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent
            aria-atomic="true"
            aria-live="assertive"
            className="flex flex-col items-start gap-3 py-6"
            role="alert"
          >
            <p className="font-medium">Current performance could not be loaded.</p>
            {onRetry ? (
              <Button onClick={onRetry} size="sm" type="button" variant="outline">
                Retry
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : overview ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {buildPerformanceModelSummary(overview).map((group) => (
            <Card key={group.activityCategory}>
              <CardHeader className="pb-2">
                <CardTitle>{group.title}</CardTitle>
              </CardHeader>
              <CardContent className="divide-y">
                {group.items.map((item) => (
                  <article
                    aria-label={`${item.label.startsWith(`${group.title} `) ? "" : `${group.title} `}${item.label}: ${item.valueLabel}, ${item.statusLabel}`}
                    className="space-y-2 py-4 first:pt-0 last:pb-0"
                    key={item.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-medium">{item.label}</h3>
                        <p className="text-lg font-semibold">{item.valueLabel}</p>
                      </div>
                      <Badge variant={statusVariant(item)}>{item.statusLabel}</Badge>
                    </div>
                    {item.status === "unavailable" ? null : (
                      <dl className="grid gap-1 text-xs text-muted-foreground">
                        <div className="flex gap-1">
                          <dt className="font-medium text-foreground">Confidence:</dt>
                          <dd>{item.confidenceLabel}</dd>
                        </div>
                        <div className="flex gap-1">
                          <dt className="font-medium text-foreground">Freshness:</dt>
                          <dd>{item.freshnessLabel}</dd>
                        </div>
                      </dl>
                    )}
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">Training impact:</span>{" "}
                      {item.trainingImpact}
                    </p>
                    {item.action ? <p className="text-sm font-medium">{item.action}</p> : null}
                  </article>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </section>
  );
}
