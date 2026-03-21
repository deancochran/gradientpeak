import type { MetricCardProps } from "./shared";

export const metricCardFixtures = {
  distance: {
    label: "Distance",
    value: "42.2",
    unit: "km",
    comparisonLabel: "vs plan",
    comparisonValue: "40.0 km",
    variant: "default",
  } satisfies MetricCardProps,
  fatigue: {
    label: "Fatigue",
    value: 68,
    subtitle: "Down 4 this week",
    color: "text-amber-500",
  } satisfies MetricCardProps,
};
