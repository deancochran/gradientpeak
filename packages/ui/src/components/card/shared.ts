import type { TestProps } from "../../lib/test-props";

export type CardPlatform = "web" | "native";

export const CARD_TEST_SLOTS = [
  "header",
  "title",
  "description",
  "action",
  "content",
  "footer",
] as const;

export type CardTestProps = TestProps;

export type CardClassNameOptions = CardTestProps & {
  className?: string;
};
