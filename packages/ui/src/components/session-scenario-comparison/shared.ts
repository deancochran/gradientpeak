import type { TrainingStateVisualContract } from "../training-state-chart/shared";

export type SessionScenarioSimulation = {
  transitions: readonly {
    state: {
      longTermLoad: number;
      recentLoad: number;
      loadBalance: number;
    };
    toAsOf: string;
  }[];
};

export type SessionScenarioComparisonProps = {
  alternative: SessionScenarioSimulation;
  baseline: SessionScenarioSimulation;
  emptyMessage?: string;
  timeZone: string;
};

function dateFromInstant(value: string) {
  return value.slice(0, 10);
}

/**
 * The simulator supplies the aligned horizon. This is strictly a presentation
 * adapter: it neither projects values nor fills a missing transition.
 */
export function toSessionScenarioComparisonVisual(
  input: SessionScenarioComparisonProps,
): TrainingStateVisualContract {
  const pointCount = Math.max(
    input.baseline.transitions.length,
    input.alternative.transitions.length,
  );
  return {
    points: Array.from({ length: pointCount }, (_, index) => {
      const baseline = input.baseline.transitions[index] ?? null;
      const alternative = input.alternative.transitions[index] ?? null;
      return {
        date: dateFromInstant(baseline?.toAsOf ?? alternative?.toAsOf ?? ""),
        index,
        recorded: {
          fitness: baseline?.state.longTermLoad ?? null,
          fatigue: baseline?.state.recentLoad ?? null,
          form: baseline?.state.loadBalance ?? null,
        },
        projected: {
          fitness: alternative?.state.longTermLoad ?? null,
          fatigue: alternative?.state.recentLoad ?? null,
          form: alternative?.state.loadBalance ?? null,
        },
      };
    }),
    sourceStatus: "mixed",
    timeZone: input.timeZone,
    unitLabel: "training load",
  };
}
