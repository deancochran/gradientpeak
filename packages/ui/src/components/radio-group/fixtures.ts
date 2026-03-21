export const radioGroupFixtures = {
  sport: {
    id: "preferred-sport",
    options: [
      { label: "Run", value: "run" },
      { label: "Ride", value: "ride" },
      { label: "Swim", value: "swim" },
    ],
    testId: "preferred-sport-radio-group",
    value: "ride",
  },
} as const;
