import type { TestProps } from "../../lib/test-props";

export const TEXT_VARIANTS = [
  "default",
  "h1",
  "h2",
  "h3",
  "h4",
  "p",
  "blockquote",
  "code",
  "lead",
  "large",
  "small",
  "muted",
] as const;

export type TextVariant = (typeof TEXT_VARIANTS)[number];

export type TextVariantProps = {
  variant?: TextVariant;
};

export type TextTestProps = Omit<TestProps, "role">;

export const TEXT_ROLE: Partial<Record<TextVariant, string>> = {
  h1: "heading",
  h2: "heading",
  h3: "heading",
  h4: "heading",
  blockquote: "blockquote",
  code: "code",
};

export const TEXT_ARIA_LEVEL: Partial<Record<TextVariant, string>> = {
  h1: "1",
  h2: "2",
  h3: "3",
  h4: "4",
};
