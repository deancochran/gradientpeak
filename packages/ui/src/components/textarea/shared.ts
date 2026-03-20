import type { TestProps } from "../../lib/test-props";

export const TEXTAREA_DEFAULT_NUMBER_OF_LINES = {
  native: 8,
  web: 2,
} as const;

export type TextareaTestProps = Omit<TestProps, "role">;
