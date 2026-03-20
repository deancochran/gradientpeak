import type { TestProps } from "../../lib/test-props";

export const TOGGLE_VARIANTS = ["default", "outline"] as const;
export const TOGGLE_SIZES = ["default", "sm", "lg"] as const;

export type ToggleVariant = (typeof TOGGLE_VARIANTS)[number];
export type ToggleSize = (typeof TOGGLE_SIZES)[number];

export type ToggleTestProps = TestProps;

export type ToggleVariantOptions = ToggleTestProps & {
  className?: string;
  size?: ToggleSize;
  variant?: ToggleVariant;
};

export type ToggleTextOptions = {
  className?: string;
  pressed?: boolean;
};
