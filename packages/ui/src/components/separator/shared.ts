import type { TestProps } from "../../lib/test-props";

export type SeparatorOrientation = "horizontal" | "vertical";

export type SeparatorTestProps = TestProps;

export type SeparatorClassNameOptions = SeparatorTestProps & {
  className?: string;
  orientation?: SeparatorOrientation;
};
