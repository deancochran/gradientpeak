import type { TestProps } from "../../lib/test-props";

export type LabelPlatform = "web" | "native";

export type LabelTestProps = TestProps;

export type LabelRootOptions = LabelTestProps & {
  className?: string;
  disabled?: boolean;
};

export type LabelTextOptions = {
  className?: string;
};
