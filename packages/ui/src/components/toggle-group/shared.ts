import type { TestProps } from "../../lib/test-props";
import type { ToggleSize, ToggleVariant } from "../toggle/shared";

export type ToggleGroupTestProps = TestProps;

export type ToggleGroupContextValue = {
  size?: ToggleSize;
  spacing?: number;
  variant?: ToggleVariant;
};
