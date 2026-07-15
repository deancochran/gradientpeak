import { INITIAL_ONBOARDING_DATA } from "./onboarding-data";
import { getOnboardingSteps } from "./onboarding-steps";

jest.mock("./steps", () => ({
  ConnectAndImportStep: () => null,
  GoalsPreferencesStep: () => null,
  GroupsAndPeopleStep: () => null,
  ProfileAndIntentStep: () => null,
  SummaryStep: () => null,
  TrainingBaselineStep: () => null,
}));

describe("training baseline onboarding validation", () => {
  const baselineStep = getOnboardingSteps({
    providerSyncStarted: false,
    canContinueProviderSync: true,
    isUsernameAvailable: true,
  }).find((step) => step.id === "training_baseline");

  it.each([30, 300])("accepts canonical weight boundary %s kg", (weight_kg) => {
    expect(baselineStep?.isValid({ ...INITIAL_ONBOARDING_DATA, weight_kg })).toBe(true);
  });

  it.each([29.9, 300.1])("blocks weight outside canonical bounds: %s kg", (weight_kg) => {
    expect(baselineStep?.isValid({ ...INITIAL_ONBOARDING_DATA, weight_kg })).toBe(false);
  });
});
