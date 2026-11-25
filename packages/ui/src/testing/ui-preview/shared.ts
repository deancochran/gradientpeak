import { buttonFixtures } from "../../components/button/fixtures";
import { cardFixtures } from "../../components/card/fixtures";
import { checkboxFixtures } from "../../components/checkbox/fixtures";
import { emptyStateCardFixtures } from "../../components/empty-state-card/fixtures";
import { errorStateCardFixtures } from "../../components/error-state-card/fixtures";
import { identitySummaryFixtures } from "../../components/identity-summary/fixtures";
import { inputFixtures } from "../../components/input/fixtures";
import { loadingSkeletonFixtures } from "../../components/loading-skeletons/fixtures";
import { radioGroupFixtures } from "../../components/radio-group/fixtures";
import { selectFixtures } from "../../components/select/fixtures";
import { sessionScenarioComparisonFixtures } from "../../components/session-scenario-comparison/fixtures";
import { switchFixtures } from "../../components/switch/fixtures";
import { tabsFixtures } from "../../components/tabs/fixtures";
import { trainingStateChartFixtures } from "../../components/training-state-chart/fixtures";
import type { TrainingStateChartProps } from "../../components/training-state-chart/shared";
import { uiPreviewContract, uiPreviewFormFields, uiPreviewScenarios } from "./contract";

export { uiPreviewContract, uiPreviewFormFields, uiPreviewScenarios };

export const uiPreviewFixtures = {
  trainingState: {
    emptyMessage: "Training state is unavailable for this period.",
    series: [
      { metric: "fitness", source: "recorded" },
      { metric: "fatigue", source: "recorded" },
      { metric: "form", source: "recorded" },
      { metric: "fitness", source: "projected" },
      { metric: "fatigue", source: "projected" },
      { metric: "form", source: "projected" },
    ],
    testId: "ui-preview-training-state-chart",
    title: "Recorded and projected training state",
    visual: trainingStateChartFixtures.mixedSeries,
  } satisfies TrainingStateChartProps,
  sessionScenarioComparison: sessionScenarioComparisonFixtures.aligned,
  button: buttonFixtures.save,
  card: cardFixtures,
  checkbox: checkboxFixtures.terms,
  emptyStateCard: emptyStateCardFixtures.generic,
  errorStateCard: errorStateCardFixtures.generic,
  identitySummary: identitySummaryFixtures.assignedAthlete,
  input: inputFixtures.email,
  loadingSkeleton: loadingSkeletonFixtures,
  radioGroup: radioGroupFixtures.activityCategory,
  select: selectFixtures.sessionFocus,
  switch: switchFixtures.notifications,
  tabs: tabsFixtures.settings,
} as const;
