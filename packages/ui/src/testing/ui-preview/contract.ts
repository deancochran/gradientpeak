export const uiPreviewContract = {
  description:
    "This surface renders shared UI components from @repo/ui using the same fixtures that drive package tests, Storybook, and runtime automation.",
  eyebrow: "Shared UI Preview",
  mobileTitle: "Fixture-driven mobile preview",
  rootTestId: "ui-preview-surface",
  scenarios: {
    accountControls: {
      description: "A shared card with input and save action fixtures.",
      testId: "ui-preview-scenario-account-controls",
      title: "Account controls",
    },
    planTabs: {
      description: "A shared tabs scenario with overview, sessions, and notes content.",
      testId: "ui-preview-scenario-plan-tabs",
      title: "Plan tabs",
    },
    feedbackStates: {
      description: "Shared loading, empty, and error states for runtime smoke coverage.",
      testId: "ui-preview-scenario-feedback-states",
      title: "Feedback states",
    },
    formFields: {
      description: "Shared form wrappers composed into a realistic multi-field editing flow.",
      testId: "ui-preview-scenario-form-fields",
      title: "Form fields",
    },
    selectionControls: {
      description:
        "Shared toggles and selectors for consent, channel, workout type, and sport choice.",
      testId: "ui-preview-scenario-selection-controls",
      title: "Selection controls",
    },
  },
  webTitle: "Fixture-driven runtime preview",
} as const;

export const uiPreviewScenarios = [
  uiPreviewContract.scenarios.accountControls,
  uiPreviewContract.scenarios.planTabs,
  uiPreviewContract.scenarios.feedbackStates,
  uiPreviewContract.scenarios.formFields,
  uiPreviewContract.scenarios.selectionControls,
] as const;

export const uiPreviewFormFields = {
  bioTestId: "ui-preview-form-bio",
  isPublicTestId: "ui-preview-form-is-public",
  submitButtonTestId: "ui-preview-form-submit",
  sportTestId: "ui-preview-form-sport",
  usernameErrorTestId: "ui-preview-form-username-error",
  usernameTestId: "ui-preview-form-username",
} as const;
