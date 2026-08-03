import type {
  ActivityPrescriptionQuantificationBundle,
  CanonicalActivityCategory,
} from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader } from "@repo/ui/components/card";
import { getActivityQuantificationPresentation } from "@repo/ui/lib/activity-quantification-presentation";
import { useRef, useState } from "react";

import { formatDuration } from "../../lib/activity-route-helpers";

export type WebPlannedDaySummaryData = {
  summary: {
    eventCount: number;
    activity_categories: CanonicalActivityCategory[];
    totalDurationSeconds: number | null;
    prescriptionQuantification: ActivityPrescriptionQuantificationBundle;
  };
  source: {
    complete: true;
    eventCount: number;
    unavailableEstimateCount: number;
    unavailablePlanCount: number;
    unlinkedPlanCount: number;
  };
};

function formatActivityCategory(activity_category: CanonicalActivityCategory) {
  return activity_category.charAt(0).toUpperCase() + activity_category.slice(1);
}

export function formatPlannedDayActivityCategories(
  activity_categories: readonly CanonicalActivityCategory[],
) {
  return [...new Set(activity_categories)].map(formatActivityCategory).join(" + ");
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function PlannedDaySummary({
  data,
  error,
  isLoading,
  onRetry,
}: {
  data?: WebPlannedDaySummaryData;
  error: boolean;
  isLoading: boolean;
  onRetry: () => Promise<unknown> | undefined;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [retryStatus, setRetryStatus] = useState<string | null>(null);

  async function handleRetry() {
    setRetryStatus("Retrying planned workload...");
    try {
      await onRetry();
      setRetryStatus("Planned workload retry finished.");
    } catch {
      setRetryStatus("Planned workload retry failed. The error remains available.");
    } finally {
      headingRef.current?.focus();
    }
  }

  return (
    <Card aria-labelledby="planned-workload-heading" role="region">
      <CardHeader>
        <h2
          ref={headingRef}
          id="planned-workload-heading"
          tabIndex={-1}
          className="leading-none font-semibold"
        >
          Planned workload
        </h2>
        <CardDescription>
          Scheduled and completed plan Events; cancelled Events are excluded. Totals are planned
          estimates, not actual or remaining load.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && !data ? (
          <p aria-live="polite" className="text-sm text-muted-foreground" role="status">
            Loading planned workload...
          </p>
        ) : null}

        {retryStatus ? (
          <p aria-live="polite" className="text-sm text-muted-foreground" role="status">
            {retryStatus}
          </p>
        ) : null}

        {error ? (
          <div className="flex flex-wrap items-center justify-between gap-3" role="alert">
            <p className="text-sm">Planned workload could not be loaded.</p>
            <Button size="sm" type="button" variant="outline" onClick={() => void handleRetry()}>
              Retry planned workload
            </Button>
          </div>
        ) : null}

        {data ? <PlannedDaySummaryDetails data={data} /> : null}
      </CardContent>
    </Card>
  );
}

function PlannedDaySummaryDetails({ data }: { data: WebPlannedDaySummaryData }) {
  const { source, summary } = data;
  const quantification = getActivityQuantificationPresentation(summary.prescriptionQuantification);
  const hasPartialInformation =
    source.unavailableEstimateCount > 0 ||
    source.unavailablePlanCount > 0 ||
    source.unlinkedPlanCount > 0;

  if (summary.eventCount === 0) {
    return <p className="text-sm text-muted-foreground">No planned Events for this day.</p>;
  }

  return (
    <>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Planned Events</dt>
          <dd className="font-medium">{pluralize(summary.eventCount, "Event")}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Activity category mix</dt>
          <dd className="font-medium">
            {summary.activity_categories.length > 0
              ? formatPlannedDayActivityCategories(summary.activity_categories)
              : "Unavailable"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Planned duration</dt>
          <dd className="font-medium">
            {summary.totalDurationSeconds === null
              ? "Unavailable"
              : formatDuration(summary.totalDurationSeconds)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{quantification.commonLoad.label}</dt>
          <dd className="font-medium">{quantification.commonLoad.value}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{quantification.normalizedIntensity.label}</dt>
          <dd className="font-medium">{quantification.normalizedIntensity.value}</dd>
        </div>
      </dl>

      <p className="text-sm text-muted-foreground">
        {quantification.commonLoad.evidence}. {quantification.commonLoad.explanation}
      </p>

      {hasPartialInformation ? (
        <p className="rounded-lg border p-3 text-sm" role="status">
          Partial information:{" "}
          {source.unavailableEstimateCount > 0
            ? `${pluralize(source.unavailableEstimateCount, "Event")} has unavailable planned estimates. `
            : ""}
          {source.unavailablePlanCount > 0
            ? `${pluralize(source.unavailablePlanCount, "linked plan")} is unavailable. `
            : ""}
          {source.unlinkedPlanCount > 0
            ? `${pluralize(source.unlinkedPlanCount, "Event")} has no linked plan.`
            : ""}
        </p>
      ) : null}
    </>
  );
}
