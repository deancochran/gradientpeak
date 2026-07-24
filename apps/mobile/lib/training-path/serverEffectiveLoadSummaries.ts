import { aggregateCommonLoadEnvelopes, type CommonLoadAggregate } from "@repo/core/load";
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
  /** Server-composed common Load; never inferred from a local TSS field. */
  commonLoad: number | null;
  intensity: number | null;
  completedLoad: number | null;
  remainingLoad: number | null;
  tentativeLoad: number | null;
  hasUnavailableCompletedLoad: boolean;
};

type EffectiveLoadResponse =
  | {
      status: "available";
      completed: CommonLoadAggregate;
      remaining: CommonLoadAggregate;
      tentative: CommonLoadAggregate;
      effective:
        | {
            status: "available";
            firmItems: EffectiveCompositionItem[];
            tentativeItems: EffectiveCompositionItem[];
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

function unavailableSummary(): ServerEffectiveLoadSummary {
  return {
    status: "unavailable",
    commonLoad: null,
    intensity: null,
    completedLoad: null,
    remainingLoad: null,
    tentativeLoad: null,
    hasUnavailableCompletedLoad: false,
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
  if (!response || response.status !== "available" || response.effective.status !== "available") {
    return new Map(input.periods.map((period) => [period.key, unavailableSummary()]));
  }
  const effective = response.effective;

  return new Map(
    input.periods.map((period) => {
      const firmItems = effective.firmItems.filter(
        (item) => item.date >= period.startDate && item.date <= period.endDate,
      );
      const tentativeItems = effective.tentativeItems.filter(
        (item) => item.date >= period.startDate && item.date <= period.endDate,
      );
      // Only the server composition knows whether an empty period is a known zero. In
      // particular, do not turn a partial bounded source into a client-side zero.
      if (
        firmItems.length === 0 &&
        effective.firm.status !== "complete" &&
        effective.firm.status !== "known_zero"
      ) {
        return [period.key, unavailableSummary()];
      }
      const firm = summarize(firmItems);
      const completed = aggregateCommonLoadEnvelopes(
        firmItems.filter((item) => item.kind === "completed").map((item) => item.commonLoad),
      );
      const remaining = aggregateCommonLoadEnvelopes(
        firmItems.filter((item) => item.kind === "scheduled").map((item) => item.commonLoad),
      );
      const tentative =
        tentativeItems.length === 0 && response.sourceCoverage.scheduledItems?.status !== "complete"
          ? { status: "unavailable", commonLoad: null, intensity: null }
          : summarize(tentativeItems);
      return [
        period.key,
        {
          ...firm,
          completedLoad: aggregateValue(completed),
          remainingLoad: aggregateValue(remaining),
          tentativeLoad: tentative.status === "unavailable" ? null : tentative.commonLoad,
          hasUnavailableCompletedLoad:
            firmItems.some((item) => item.kind === "completed") &&
            (completed.status === "unavailable" || completed.status === "partial"),
        },
      ];
    }),
  );
}
