import type { TestProps } from "../../lib/test-props";

export const BADGE_VARIANTS = [
  "default",
  "secondary",
  "destructive",
  "outline",
] as const;

export type BadgeVariant = (typeof BADGE_VARIANTS)[number];

export type BadgeTestProps = TestProps;

export type BadgeVariantOptions = BadgeTestProps & {
  className?: string;
  variant?: BadgeVariant;
};
