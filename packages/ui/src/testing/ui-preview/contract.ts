export const uiPreviewContract = {
  description:
    "This surface renders shared UI components from @repo/ui using the same fixtures that drive package tests, Storybook, and runtime automation.",
  eyebrow: "Shared UI Preview",
  mobileTitle: "Fixture-driven mobile preview",
  rootTestId: "ui-preview-surface",
  scenarios: {
    trainingState: {
      description:
        "Recorded and projected training-state values retain gaps, zeroes, and negative form.",
      testId: "ui-preview-scenario-training-state",
      title: "Training state",
    },
    sessionScenarioComparison: {
      description:
        "Baseline and alternative scenario projections share a horizon and never fill unavailable values.",
      testId: "ui-preview-scenario-session-scenario-comparison",
      title: "Session scenario comparison",
    },
    thresholdHistory: {
      description:
        "Threshold charts retain timestamps and units, with policy gaps and pace kept on separate scales.",
      testId: "ui-preview-scenario-threshold-history",
      title: "Threshold history",
    },
    identitySummary: {
      description: "Shared identity hierarchy with supporting context and status.",
      testId: "ui-preview-scenario-identity-summary",
      title: "Identity summary",
    },
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
        "Shared toggles and selectors for consent, channel, session focus, and activity category choice.",
      testId: "ui-preview-scenario-selection-controls",
      title: "Selection controls",
    },
  },
  webTitle: "Fixture-driven runtime preview",
} as const;

export const uiPreviewScenarios = [
  uiPreviewContract.scenarios.trainingState,
  uiPreviewContract.scenarios.sessionScenarioComparison,
  uiPreviewContract.scenarios.thresholdHistory,
  uiPreviewContract.scenarios.identitySummary,
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
  activityCategoryTestId: "ui-preview-form-activity-category",
  usernameErrorTestId: "ui-preview-form-username-error",
  usernameTestId: "ui-preview-form-username",
} as const;

/** Canonical runtime selectors included in the generated preview manifest. */
export const uiPreviewScenarioSelectors = {
  trainingState: ["ui-preview-training-state-chart"],
  sessionScenarioComparison: ["ui-preview-session-scenario-comparison"],
  thresholdHistory: ["ui-preview-threshold-bike-power", "ui-preview-threshold-run-pace"],
  identitySummary: [],
  accountControls: ["profile-card", "auth-email", "settings-save"],
  feedbackStates: [],
  formFields: [
    uiPreviewFormFields.usernameTestId,
    uiPreviewFormFields.bioTestId,
    uiPreviewFormFields.isPublicTestId,
    uiPreviewFormFields.activityCategoryTestId,
    uiPreviewFormFields.submitButtonTestId,
  ],
  planTabs: [
    "settings-tabs",
    "settings-tabs-trigger-overview",
    "settings-tabs-trigger-sessions",
    "settings-tabs-content-overview",
  ],
  selectionControls: [
    "accept-terms-checkbox",
    "email-notifications-switch",
    "session-focus-select",
    "preferred-activity-category-radio-group",
  ],
} as const satisfies Record<keyof typeof uiPreviewContract.scenarios, readonly string[]>;
