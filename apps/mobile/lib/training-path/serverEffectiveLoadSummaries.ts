import {
  aggregateCommonLoadEnvelopes,
  type CommonLoadAggregate,
  type CommonLoadRecommendation,
} from "@repo/core/load";
import type {
  EffectiveCompositionItem,
  EffectiveLoadAggregate,
} from "@repo/core/training-timeline";

export type EffectiveLoadPeriod = {
  key: string;
  startDate: string;
  endDate: string;
};

export type ServerEffectiveLoadSummary = {
  status: "complete" | "partial" | "known_zero" | "unavailable";
  /** Server-composed Common Load; never inferred from an unversioned local field. */
  commonLoad: number | null;
  intensity: number | null;
  completedLoad: number | null;
  remainingLoad: number | null;
  hasUnavailableCompletedLoad: boolean;
  recommendedLoadStatus: "complete" | "partial" | "known_zero" | "unavailable";
  recommendedLoad: number | null;
};

type EffectiveLoadResponse =
  | {
      status: "available";
      completed: CommonLoadAggregate;
      remaining: CommonLoadAggregate;
      recommendation?: CommonLoadRecommendation;
      effective:
        | {
            status: "available";
            firmItems: EffectiveCompositionItem[];
            firm: EffectiveLoadAggregate;
          }
        | { status: "integrity_unavailable" };
      sourceCounts: { activities: number; events: number };
      resolvedRange: { endDate: string | null; startDate: string | null; timezone: string | null };
      sourceCoverage: {
        activities: { endDate: string; startDate: string; status: "complete" | "partial" } | null;
        scheduledItems: {
          endDate: string;
          startDate: string;
          status: "complete" | "partial";
        } | null;
      };
    }
  | { status: "unavailable" };

function aggregateValue(aggregate: CommonLoadAggregate): number | null {
  return aggregate.status === "unavailable" ? null : aggregate.load;
}

function summarize(
  items: readonly EffectiveCompositionItem[],
): Pick<ServerEffectiveLoadSummary, "status" | "commonLoad" | "intensity"> {
  if (items.length === 0) return { status: "known_zero", commonLoad: 0, intensity: null };
  const aggregate = aggregateCommonLoadEnvelopes(items.map((item) => item.commonLoad));
  if (aggregate.status === "unavailable") {
    return { status: "unavailable", commonLoad: null, intensity: null };
  }
  return {
    status: aggregate.status,
    commonLoad: aggregate.load,
    intensity: aggregate.intensity,
  };
}

type RecommendationSummary = Pick<
  ServerEffectiveLoadSummary,
  "recommendedLoad" | "recommendedLoadStatus"
>;

function unavailableRecommendationSummary(): RecommendationSummary {
  return { recommendedLoadStatus: "unavailable", recommendedLoad: null };
}

function summarizeRecommendation(
  period: EffectiveLoadPeriod,
  recommendation: CommonLoadRecommendation | undefined,
): RecommendationSummary {
  if (
    !recommendation ||
    recommendation.status === "unavailable" ||
    period.startDate < recommendation.coverage.startDate ||
    period.endDate > recommendation.coverage.endDate
  ) {
    return unavailableRecommendationSummary();
  }
  const points = recommendation.points.filter(
    (point) => point.date >= period.startDate && point.date <= period.endDate,
  );
  if (points.length === 0) return unavailableRecommendationSummary();
  let load = 0;
  let hasNumericLoad = false;
  let incomplete = false;
  let hasPrescription = false;
  for (const point of points) {
    if (point.state === "known_zero") continue;
    hasPrescription = true;
    if (point.state === "unavailable") {
      incomplete = true;
      continue;
    }
    hasNumericLoad = true;
    load += point.load;
    if (point.state === "partial") incomplete = true;
  }
  if (!hasPrescription) return { recommendedLoadStatus: "known_zero", recommendedLoad: 0 };
  if (!hasNumericLoad) return unavailableRecommendationSummary();
  return {
    recommendedLoadStatus: incomplete ? "partial" : "complete",
    recommendedLoad: load,
  };
}

function unavailableSummary(
  recommendation: RecommendationSummary = unavailableRecommendationSummary(),
): ServerEffectiveLoadSummary {
  return {
    status: "unavailable",
    commonLoad: null,
    intensity: null,
    completedLoad: null,
    remainingLoad: null,
    hasUnavailableCompletedLoad: false,
    ...recommendation,
  };
}

/**
 * Groups the server's already-composed facts for presentation periods. This intentionally does
 * not read events or activities, link completions, or infer Load on-device.
 */
export function buildServerEffectiveLoadSummaries(input: {
  periods: readonly EffectiveLoadPeriod[];
  response: EffectiveLoadResponse | undefined;
}): Map<string, ServerEffectiveLoadSummary> {
  const response = input.response;
  if (!response || response.status !== "available") {
    return new Map(input.periods.map((period) => [period.key, unavailableSummary()]));
  }
  const effective = response.effective;

  return new Map(
    input.periods.map((period) => {
      const recommendation = summarizeRecommendation(period, response.recommendation);
      if (effective.status !== "available") {
        return [period.key, unavailableSummary(recommendation)];
      }
      const resolvedStartDate = response.resolvedRange.startDate;
      const resolvedEndDate = response.resolvedRange.endDate;
      if (
        !resolvedStartDate ||
        !resolvedEndDate ||
        period.startDate < resolvedStartDate ||
        period.endDate > resolvedEndDate
      ) {
        return [period.key, unavailableSummary(recommendation)];
      }
      const firmItems = effective.firmItems.filter(
        (item) => item.date >= period.startDate && item.date <= period.endDate,
      );
      // Only the server composition knows whether an empty period is a known zero. In
      // particular, do not turn a partial bounded source into a client-side zero.
      if (
        firmItems.length === 0 &&
        effective.firm.status !== "complete" &&
        effective.firm.status !== "known_zero"
      ) {
        return [period.key, unavailableSummary(recommendation)];
      }
      const firm = summarize(firmItems);
      const completed = aggregateCommonLoadEnvelopes(
        firmItems.filter((item) => item.kind === "completed").map((item) => item.commonLoad),
      );
      const remaining = aggregateCommonLoadEnvelopes(
        firmItems.filter((item) => item.kind === "scheduled").map((item) => item.commonLoad),
      );
      return [
        period.key,
        {
          ...firm,
          completedLoad: aggregateValue(completed),
          remainingLoad: aggregateValue(remaining),
          hasUnavailableCompletedLoad:
            firmItems.some((item) => item.kind === "completed") &&
            (completed.status === "unavailable" || completed.status === "partial"),
          ...recommendation,
        },
      ];
    }),
  );
}
