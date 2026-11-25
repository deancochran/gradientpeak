import React from "react";
import { createHost } from "../../../test/mock-components";
import { renderNative, screen } from "../../../test/render-native";
import type { PlanningLedgerPresentation } from "./planningLedgerPresentation";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  View: createHost("View"),
}));

jest.mock("@repo/ui/components/icon", () => ({
  __esModule: true,
  Icon: createHost("Icon"),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

jest.mock("@repo/ui/components/training-state-chart", () => ({
  __esModule: true,
  TrainingStateChart: ({ testId, ...props }: { testId?: string; [key: string]: unknown }) =>
    React.createElement("TrainingStateChart", { ...props, testID: testId }),
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  Minus: "Minus",
  TrendingDown: "TrendingDown",
  TrendingUp: "TrendingUp",
}));

jest.mock("@/lib/stores/theme-store", () => ({
  __esModule: true,
  useTheme: () => ({ resolvedTheme: "light" }),
}));

jest.mock("../training-path/planChartTheme", () => ({
  __esModule: true,
  getPlanChartTheme: () => ({
    trainingState: { fatigue: "#d97706", fitness: "#2563eb", form: "#7c3aed" },
  }),
}));

const TrainingStateContextChart = require("./TrainingStateContextChart").TrainingStateContextChart;

function createState(
  sourceStatus: PlanningLedgerPresentation["state"]["sourceStatus"],
): PlanningLedgerPresentation["state"] {
  return {
    fatigueDirection: "Stable",
    fitnessDirection: "Rising",
    formDirection: "Falling",
    latestFatigueLabel: "36",
    latestFitnessLabel: "48",
    latestFormLabel: "12",
    latestSource: sourceStatus === "unavailable" ? null : "Recorded",
    points: [
      {
        actualFatigue: sourceStatus === "projected" || sourceStatus === "unavailable" ? null : 36,
        actualFitness: sourceStatus === "projected" || sourceStatus === "unavailable" ? null : 48,
        actualForm: sourceStatus === "projected" || sourceStatus === "unavailable" ? null : 12,
        date: "2026-04-13",
        index: 0,
        projectedFatigue: sourceStatus === "recorded" || sourceStatus === "unavailable" ? null : 37,
        projectedFitness: sourceStatus === "recorded" || sourceStatus === "unavailable" ? null : 49,
        projectedForm: sourceStatus === "recorded" || sourceStatus === "unavailable" ? null : 12,
      },
    ],
    sourceStatus,
    summary: "Training state summary",
    timeZone: "America/Los_Angeles",
    unitLabel: "Common Load points",
  };
}

it.each([
  ["recorded", ["recorded"]],
  ["projected", ["projected"]],
  ["mixed", ["recorded", "projected"]],
] as const)("declares only %s state series", async (sourceStatus, sources) => {
  await renderNative(<TrainingStateContextChart state={createState(sourceStatus)} />);

  const series = screen.getByTestId("planning-ledger-state-chart").props.series as readonly {
    metric: string;
    source: string;
  }[];
  expect(series).toHaveLength(sources.length * 3);
  expect([...new Set(series.map((entry) => entry.source))]).toEqual(sources);
  expect([...new Set(series.map((entry) => entry.metric))]).toEqual(["fitness", "fatigue", "form"]);
});
