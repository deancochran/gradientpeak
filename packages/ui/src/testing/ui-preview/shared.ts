import { buttonFixtures } from "../../components/button/fixtures";
import { cardFixtures } from "../../components/card/fixtures";
import { checkboxFixtures } from "../../components/checkbox/fixtures";
import { emptyStateCardFixtures } from "../../components/empty-state-card/fixtures";
import { errorStateCardFixtures } from "../../components/error-state-card/fixtures";
import { inputFixtures } from "../../components/input/fixtures";
import { loadingSkeletonFixtures } from "../../components/loading-skeletons/fixtures";
import { radioGroupFixtures } from "../../components/radio-group/fixtures";
import { selectFixtures } from "../../components/select/fixtures";
import { switchFixtures } from "../../components/switch/fixtures";
import { tabsFixtures } from "../../components/tabs/fixtures";
import { uiPreviewContract, uiPreviewFormFields, uiPreviewScenarios } from "./contract";

export { uiPreviewContract, uiPreviewFormFields, uiPreviewScenarios };

export const uiPreviewFixtures = {
  button: buttonFixtures.save,
  card: cardFixtures,
  checkbox: checkboxFixtures.terms,
  emptyStateCard: emptyStateCardFixtures.generic,
  errorStateCard: errorStateCardFixtures.generic,
  input: inputFixtures.email,
  loadingSkeleton: loadingSkeletonFixtures,
  radioGroup: radioGroupFixtures.sport,
  select: selectFixtures.workoutType,
  switch: switchFixtures.notifications,
  tabs: tabsFixtures.settings,
} as const;
