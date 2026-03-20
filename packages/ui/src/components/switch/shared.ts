import type { TestProps } from "../../lib/test-props";

export const SWITCH_NATIVE_MINIMUM_HIT_SLOP = {
  top: 13,
  bottom: 13,
  left: 6,
  right: 6,
} as const;

export type SwitchTestProps = TestProps;
