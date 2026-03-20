export const inputFixtures = {
  email: {
    accessibilityLabel: "Email",
    id: "email-input",
    placeholder: "runner@example.com",
    testId: "auth-email",
    type: "email",
  },
  states: {
    defaultPlaceholder: "Default field",
    disabledValue: "Disabled value",
    invalidValue: "Needs attention",
    value: "Editable value",
  },
} as const;
