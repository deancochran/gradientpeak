export const radioGroupFixtures = {
  activityCategory: {
    id: "preferred-activity-category",
    options: [
      { label: "Run", value: "run" },
      { label: "Bike", value: "bike" },
      { label: "Swim", value: "swim" },
    ],
    testId: "preferred-activity-category-radio-group",
    value: "bike",
  },
} as const;
