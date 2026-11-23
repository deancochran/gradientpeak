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

function dateFromInstant(value: string, timeZone: string) {
  const instant = new Date(value);
  if (Number.isNaN(instant.valueOf()))
    throw new Error("Scenario transition must have a valid instant.");
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(instant);
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );
  if (!values.year || !values.month || !values.day)
    throw new Error("Scenario transition could not be placed in its planning timezone.");
  return `${values.year}-${values.month}-${values.day}`;
}

/**
 * This is strictly a presentation adapter: it groups each source's canonical
 * instants by planning day and never projects, fills, or interpolates a gap.
 */
export function toSessionScenarioComparisonVisual(
  input: SessionScenarioComparisonProps,
): TrainingStateVisualContract {
  const transitionsByDate = (transitions: SessionScenarioSimulation["transitions"]) =>
    new Map(
      transitions.map((transition) => [
        dateFromInstant(transition.toAsOf, input.timeZone),
        transition,
      ]),
    );
  const baselineByDate = transitionsByDate(input.baseline.transitions);
  const alternativeByDate = transitionsByDate(input.alternative.transitions);
  const dates = [...new Set([...baselineByDate.keys(), ...alternativeByDate.keys()])].sort();
  return {
    points: dates.map((date, index) => {
      const baseline = baselineByDate.get(date) ?? null;
      const alternative = alternativeByDate.get(date) ?? null;
      return {
        date,
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
