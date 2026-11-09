export const nativePickerFixtures = {
  rpe: {
    label: "RPE",
    value: 5,
    options: Array.from({ length: 19 }, (_, index) => ({
      value: 1 + index / 2,
      label: String(1 + index / 2),
    })),
  },
};
