import type { TestProps } from "../../lib/test-props";

export const BUTTON_VARIANTS = [
  "default",
  "destructive",
  "outline",
  "secondary",
  "ghost",
  "link",
] as const;

export const BUTTON_SIZES = ["default", "sm", "lg", "icon"] as const;

export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];
export type ButtonSize = (typeof BUTTON_SIZES)[number];
export type ButtonTestProps = TestProps;

export type ButtonVariantOptions = ButtonTestProps & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
};
