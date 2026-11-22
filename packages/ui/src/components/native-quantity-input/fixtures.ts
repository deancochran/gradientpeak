import type { NativeQuantityInputProps } from "./index.native";

export const nativeQuantityInputFixtures = {
  distance: {
    decimals: 3,
    label: "Distance",
    max: 1000,
    min: 0.001,
    onChange: () => undefined,
    onNumberChange: () => undefined,
    unitLabel: "km",
    value: "42.195",
  },
} satisfies Record<string, NativeQuantityInputProps>;
