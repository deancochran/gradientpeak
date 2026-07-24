import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";

import { getCommonLoadPresentation } from "../../lib/activity-load-presentation";
import { formatShortDayLabel } from "../../lib/planning";

type EffectiveItem = {
  commonLoad: unknown;
  completedActivityId?: string;
  date: string;
  kind: "completed" | "scheduled";
  scheduledItemId?: string;
};

type EffectiveLoad = {
  status: "available" | "unavailable";
  reason?: string;
  completed?: unknown;
  remaining?: unknown;
  resolvedRange?: {
    endDate: string | null;
    startDate: string | null;
    timezone: string | null;
  };
  sourceCoverage?: SourceCoverage;
  tentative?: unknown;
  effective?: {
    status: "available" | "integrity_unavailable";
    reason?: string;
    firmItems?: EffectiveItem[];
    tentativeItems?: EffectiveItem[];
  };
};

type SourceCoverage = {
  activities: { status: "complete" | "partial" } | null;
  scheduledItems: { status: "complete" | "partial" } | null;
};

function coverageIsComplete(coverage: { status: "complete" | "partial" } | null | undefined) {
  return coverage?.status === "complete";
}

function coverageLabel(coverage: SourceCoverage | undefined) {
  const activities = coverage?.activities?.status ?? "unavailable";
  const scheduled = coverage?.scheduledItems?.status ?? "unavailable";
  return `Completed activity coverage is ${activities}; scheduled work coverage is ${scheduled}.`;
}

function resolvedRangeLabel(range: EffectiveLoad["resolvedRange"]) {
  if (!range?.startDate || !range.endDate) return "for the server-resolved current week";
  return `for ${range.startDate}–${range.endDate}${range.timezone ? ` in ${range.timezone}` : ""}`;
}

function LoadValue({ value }: { value: unknown }) {
  const presentation = getCommonLoadPresentation(value);
  if (presentation.status === "unavailable") {
    return <Badge variant="outline">Load unavailable</Badge>;
  }
  return (
    <Badge
      variant={
        presentation.status === "available" || presentation.status === "complete"
          ? "default"
          : "outline"
      }
    >
      Load {presentation.load}
      {presentation.status === "partial" ? " · partial" : ""}
    </Badge>
  );
}

function ItemList({
  emptyMessage,
  items,
  sourceComplete,
  unavailableMessage,
}: {
  emptyMessage: string;
  items: EffectiveItem[];
  sourceComplete: boolean;
  unavailableMessage: string;
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {sourceComplete ? emptyMessage : unavailableMessage}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((item) => {
        const presentation = getCommonLoadPresentation(item.commonLoad);
        return (
          <div
            key={item.completedActivityId ?? item.scheduledItemId ?? `${item.kind}-${item.date}`}
            className="flex items-center justify-between gap-3 rounded-xl border p-3"
          >
            <div>
              <p className="font-medium">{formatShortDayLabel(item.date)}</p>
              <p className="text-xs text-muted-foreground">
                {item.kind === "completed" ? "Completed activity" : "Scheduled activity"}
              </p>
              <p className="text-xs text-muted-foreground">{presentation.explanation}</p>
            </div>
            <LoadValue value={item.commonLoad} />
          </div>
        );
      })}
    </div>
  );
}

export function TrainingLoadPath({
  effectiveLoad,
  isError = false,
  onRetry,
}: {
  effectiveLoad: EffectiveLoad | undefined;
  isError?: boolean;
  onRetry?: () => void;
}) {
  const effective = effectiveLoad?.status === "available" ? effectiveLoad.effective : undefined;
  const firmItems = effective?.status === "available" ? (effective.firmItems ?? []) : [];
  const tentativeItems = effective?.status === "available" ? (effective.tentativeItems ?? []) : [];
  const sourceCoverage = effectiveLoad?.sourceCoverage;
  const completedCoverageComplete = coverageIsComplete(sourceCoverage?.activities);
  const scheduledCoverageComplete = coverageIsComplete(sourceCoverage?.scheduledItems);
  const firmCoverageComplete = completedCoverageComplete && scheduledCoverageComplete;
  const unavailableReason =
    effectiveLoad?.status === "unavailable"
      ? effectiveLoad.reason
      : effective?.status === "integrity_unavailable"
        ? effective.reason
        : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Training path</CardTitle>
        <CardDescription>
          Server-composed common Load {resolvedRangeLabel(effectiveLoad?.resolvedRange)}. Firm and
          tentative work remain separate.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isError ? (
          <div className="space-y-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            <p>Effective plan Load could not be refreshed. No client-side estimate is shown.</p>
            {onRetry ? (
              <Button onClick={onRetry} size="sm" type="button" variant="outline">
                Retry effective plan Load
              </Button>
            ) : null}
          </div>
        ) : unavailableReason ? (
          <div className="space-y-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            <p>Effective plan Load is unavailable: {unavailableReason.replaceAll("_", " ")}.</p>
            <p>{coverageLabel(sourceCoverage)}</p>
          </div>
        ) : (
          <Tabs defaultValue="firm">
            <TabsList>
              <TabsTrigger value="firm">Firm</TabsTrigger>
              <TabsTrigger value="tentative">Tentative</TabsTrigger>
            </TabsList>
            <TabsContent value="firm" className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl border p-3">
                  <p className="text-xs text-muted-foreground">Completed this week</p>
                  <LoadValue value={effectiveLoad?.completed ?? { status: "unavailable" }} />
                </div>
                <div className="rounded-xl border p-3">
                  <p className="text-xs text-muted-foreground">Remaining firm work</p>
                  <LoadValue value={effectiveLoad?.remaining ?? { status: "unavailable" }} />
                </div>
                <div className="rounded-xl border p-3">
                  <p className="text-xs text-muted-foreground">Tentative work</p>
                  <LoadValue value={effectiveLoad?.tentative ?? { status: "unavailable" }} />
                </div>
              </div>
              <ItemList
                emptyMessage="No firm activities are scheduled in this window."
                items={firmItems}
                sourceComplete={firmCoverageComplete}
                unavailableMessage="Firm work is unavailable because completed or scheduled coverage is not complete."
              />
            </TabsContent>
            <TabsContent value="tentative">
              <ItemList
                emptyMessage="No tentative activities are scheduled in this window."
                items={tentativeItems}
                sourceComplete={scheduledCoverageComplete}
                unavailableMessage="Tentative work is unavailable because scheduled coverage is not complete."
              />
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
